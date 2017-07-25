import { EventEmitter } from 'events';
import * as path from 'path';
import * as fs from 'fs';
import * as debug from 'debug';

import * as chromeUtil from './util/chrome';
import {
  match as matchSelector,
  requireSingular,
  ElementSelector as Selector,
  StringifiedContext,
} from './util/Selector';
import { getPageURL, waitForElement, click, html } from './util/dom';

const log = debug('navalia:chrome');

export interface chromeConstructorOpts {
  flags?: chromeUtil.flags;
  cdp?: chromeUtil.cdp;
  timeout?: number;
}

export interface domOpts {
  wait?: boolean;
  timeout?: number;
}

const defaultDomOpts: domOpts = {
  wait: true,
};

export class Chrome extends EventEmitter {
  private cdp?: chromeUtil.cdp;
  private flags?: chromeUtil.flags;
  private styleSheetsLoaded: any[];
  private kill: () => Promise<{}>;
  private defaultTimeout: number;
  private navigatingPromise: Promise<any>;
  private frameId: string;

  constructor(opts: chromeConstructorOpts = {}) {
    super();

    this.styleSheetsLoaded = [];

    this.cdp = opts.cdp;
    this.flags = opts.flags || chromeUtil.defaultFlags;
    this.defaultTimeout = opts.timeout || 10000;
    this.navigatingPromise = Promise.resolve();
  }

  private async getChromeCDP(): Promise<chromeUtil.cdp> {
    if (this.cdp) {
      return this.cdp;
    }

    log(`:getChromeCDP() > starting chrome`);

    const { browser, cdp } = await chromeUtil.launch(
      this.flags || chromeUtil.defaultFlags,
    );

    log(`:getChromeCDP() > chrome launched on port ${browser.port}`);

    this.kill = browser.kill;
    this.cdp = cdp;

    return cdp;
  }

  private async runScript(
    script: string,
    async: boolean = false,
  ): Promise<any> {
    const cdp = await this.getChromeCDP();

    return await cdp.Runtime.evaluate({
      expression: script,
      returnByValue: true,
      awaitPromise: async,
    });
  }

  private async simulateKeyPress(
    type: string = 'char',
    key: string | null = null,
    modifiers: number = 0,
  ): Promise<any> {
    const cdp = await this.getChromeCDP();

    await cdp.Input.dispatchKeyEvent({
      type,
      modifiers,
      text: key,
    });
  }

  public async goto(
    url: string,
    opts: {
      coverage: boolean;
      onload: boolean;
      timeout?: number;
    } = {
      onload: true,
      coverage: false,
    },
  ): Promise<any> {
    const cdp = await this.getChromeCDP();

    const waitForPageload = opts.onload === undefined ? true : opts.onload;
    const runCoverage = opts.coverage === undefined ? false : opts.coverage;

    cdp.Page.frameStartedLoading(({ frameId }) => {
      if (frameId === this.frameId) {
        log(':pageload() > page is loading');
        this.navigatingPromise = cdp.Page.loadEventFired();
      }
    });

    if (runCoverage) {
      log(`:goto() > gathering coverage for ${url}`);
      await cdp.Profiler.enable();
      await cdp.Profiler.startPreciseCoverage();
      await cdp.CSS.startRuleUsageTracking();

      cdp.CSS.styleSheetAdded(param => {
        this.styleSheetsLoaded.push(param.header);
      });
    }

    log(`:goto() > going to ${url}`);

    return new Promise(async (resolve, reject) => {
      let hasResolved = false;
      let requestId = null;
      const timeoutId = setTimeout(
        () => reject(`Goto failed to load in the timeout specified`),
        opts.timeout || this.defaultTimeout,
      );

      cdp.Network.requestWillBeSent(params => {
        if (requestId) return;
        if (params.documentURL.includes(url)) {
          requestId = params.requestId;
        }
      });

      cdp.Network.loadingFailed(params => {
        if (hasResolved) return;
        if (params.requestId === requestId) {
          hasResolved = true;
          clearTimeout(timeoutId);
          reject(params.errorText);
        }
      });

      cdp.Network.loadingFinished(async params => {
        if (hasResolved) return;
        if (params.requestId === requestId) {
          hasResolved = true;
          clearTimeout(timeoutId);
          if (waitForPageload) {
            log(`:goto() > waiting for pageload on ${url}`);
            await cdp.Page.loadEventFired();
          }
          resolve(await this.evaluate(getPageURL));
        }
      });

      const { frameId } = await cdp.Page.navigate({ url });
      this.frameId = frameId;
    });
  }

  public async evaluate(expression: Function, ...args): Promise<any> {
    await this.navigatingPromise;

    // Assume scripts are async, and if not wrap the result in a resolve calls
    const script = `
      (() => {
        ${StringifiedContext}
        const result = (${String(expression)}).apply(null, ${JSON.stringify(
      args,
    )});
        if (result && result.then) {
          result.catch((error) => { throw new Error(error); });
          return result;
        }
        return Promise.resolve(result);
      })();
    `;

    log(`:evaluate() > executing function '${expression.name}' in Chrome`);

    // Always eval scripts as if they were async
    const response = await this.runScript(script, true);

    if (response && response.exceptionDetails) {
      throw new Error(
        JSON.stringify(
          response.exceptionDetails.exception.value ||
            response.exceptionDetails.exception.description,
        ),
      );
    }

    if (response && response.result) {
      return response.result.value;
    }

    return null;
  }

  public async screenshot(filePath?: string): Promise<void | Buffer> {
    await this.navigatingPromise;
    const cdp = await this.getChromeCDP();

    log(`:screenshot() > saving screenshot to ${filePath}`);

    const base64Image = await cdp.Page.captureScreenshot();
    const buffer = new Buffer(base64Image.data, 'base64');

    if (filePath) {
      if (!path.isAbsolute(filePath)) {
        throw new Error(`Filepath is not absolute: ${filePath}`);
      }

      return fs.writeFileSync(filePath, buffer, { encoding: 'base64' });
    }

    return buffer;
  }

  public async pdf(filePath: string): Promise<void | Buffer> {
    await this.navigatingPromise;
    const cdp = await this.getChromeCDP();

    log(`:pdf() > saving PDF to ${filePath}`);

    const base64Image = await cdp.Page.printToPDF();
    const buffer = new Buffer(base64Image.data, 'base64');

    if (filePath) {
      if (!path.isAbsolute(filePath)) {
        throw new Error(`Filepath is not absolute: ${filePath}`);
      }

      return fs.writeFileSync(filePath, buffer, { encoding: 'base64' });
    }

    return buffer;
  }

  public async size(width: number, height: number): Promise<boolean> {
    await this.navigatingPromise;
    const cdp = await this.getChromeCDP();

    log(`:size() > setting window size to ${width}x${height}`);

    await cdp.Emulation.setVisibleSize({ width, height });
    await cdp.Emulation.setDeviceMetricsOverride({
      width,
      height,
      deviceScaleFactor: 0,
      mobile: false,
      fitWindow: true,
    });

    return true;
  }

  public async exists(
    selector: Selector,
    opts: domOpts = defaultDomOpts,
  ): Promise<boolean> {
    await this.navigatingPromise;

    if (opts.wait) {
      let wasRejected = false;
      await this.wait(selector, opts.timeout).catch(() => (wasRejected = true));
      if (wasRejected) {
        return false;
      }
    }

    log(`:exists() > checking if '${selector}' exists`);

    return this.evaluate(selector => {
      return matchSelector(document, selector).length > 0;
    }, selector);
  }

  public async html(
    selector: Selector = { selector: { css: 'html' } },
    opts: domOpts = defaultDomOpts,
  ): Promise<string | null> {
    await this.navigatingPromise;

    if (opts.wait) {
      await this.wait(selector, opts.timeout);
    }

    log(`:html() > getting '${selector}' HTML`);

    return this.evaluate(html, selector);
  }

  public async text(
    selector: Selector = { selector: { css: 'body' } },
    opts: domOpts = defaultDomOpts,
  ): Promise<string> {
    await this.navigatingPromise;

    if (opts.wait) {
      await this.wait(selector, opts.timeout);
    }

    log(`:text() > getting '${selector}' text`);

    return this.evaluate(selector => {
      const ele = requireSingular(document, selector);
      return ele.textContent;
    }, selector);
  }

  public async fetch(...args): Promise<any> {
    await this.navigatingPromise;
    const cdp = await this.getChromeCDP();

    log(`:fetch() > fetching resource with args: ${JSON.stringify(args)}`);

    let requestFound = false;
    let requestHasResponded = false;
    let requestId = null;
    let response = {};

    // Might move these into a private helper...
    cdp.Network.requestWillBeSent(params => {
      if (requestFound) return;

      if (params.request.url === args[0]) {
        requestFound = true;
        requestId = params.requestId;
      }
    });

    cdp.Network.loadingFailed(params => {
      if (requestHasResponded) return;

      if (params.requestId === requestId) {
        response = Object.assign({}, response, {
          error: params.errorText,
        });
      }
    });

    cdp.Network.responseReceived(params => {
      if (requestHasResponded) return;

      if (params.requestId === requestId) {
        requestHasResponded = true;
        response = params.response;
      }
    });

    return new Promise(async resolve => {
      const body = await this.evaluate((...fetchArgs) => {
        return fetch
          .apply(null, fetchArgs)
          .then(res => {
            const contentType = res.headers.get('content-type');

            if (!res.ok) {
              throw res.statusText || res.status;
            }

            if (contentType && contentType.indexOf('application/json') !== -1) {
              return res.json();
            }

            return res.text();
          })
          .catch(() => {
            return null;
          });
      }, ...args);

      return resolve(Object.assign({}, response, body ? { body } : null));
    });
  }

  public async save(filePath?: string): Promise<boolean | string | null> {
    await this.navigatingPromise;

    const html = await this.html();

    log(`:save() > saving page HTML to ${filePath}`);

    if (filePath) {
      try {
        fs.writeFileSync(filePath, html);
        log(`:save() > page HTML saved successfully to ${filePath}`);
        return true;
      } catch (error) {
        log(`:save() > page HTML failed ${error.message}`);
        return false;
      }
    }

    return html;
  }

  public async click(
    selector: Selector,
    opts: domOpts = defaultDomOpts,
  ): Promise<boolean> {
    await this.navigatingPromise;

    if (opts.wait) {
      await this.wait(selector, opts.timeout);
    }

    log(`:click() > clicking '${selector}'`);

    return this.evaluate(click, selector);
  }

  public async focus(
    selector: Selector,
    opts: domOpts = defaultDomOpts,
  ): Promise<boolean> {
    await this.navigatingPromise;

    if (opts.wait) {
      await this.wait(selector, opts.timeout);
    }

    log(`:focus() > focusing '${selector}'`);

    await this.evaluate(selector => {
      (<HTMLElement>requireSingular(document, selector)).focus();
    }, selector);

    return true;
  }

  public async dispatchEvents(
    selector: Selector,
    events: Array<string>,
    opts: domOpts = defaultDomOpts,
  ): Promise<boolean> {
    await this.navigatingPromise;

    if (opts.wait) {
      await this.wait(selector, opts.timeout);
    }

    log(`:dispatchEvents() > dispatching to ${selector} events ${events}`);

    this.evaluate(
      (selector: Selector, events: Array<string>) => {
        const element = requireSingular(document, selector);
        events.forEach(eventName => {
          const event = document.createEvent('MouseEvent');
          event.initEvent(eventName, true, true);
          element.dispatchEvent(event);
        });
        return true;
      },
      selector,
      events,
    );
    return true;
  }

  public async type(
    selector: Selector,
    value: string,
    opts: domOpts = defaultDomOpts,
  ): Promise<boolean> {
    await this.navigatingPromise;

    if (opts.wait) {
      await this.wait(selector, opts.timeout);
    }

    // Focus on the selector
    await this.focus(selector, { wait: false });

    log(`:type() > typing text '${value}' into '${JSON.stringify(selector)}'`);

    const keys = value.split('') || [];

    await Promise.all(
      keys.map(async key => this.simulateKeyPress('char', key)),
    );

    return true;
  }

  public async check(
    selector: Selector,
    opts: domOpts = defaultDomOpts,
  ): Promise<boolean> {
    await this.navigatingPromise;

    if (opts.wait) {
      await this.wait(selector, opts.timeout);
    }

    log(`:check() > checking checkbox '${selector}'`);

    return this.evaluate(selector => {
      var element = matchSelector(document, selector);
      if (element.length > 0) {
        element[0].setAttribute('checked', 'true');
        return true;
      }
      return false;
    }, selector);
  }

  public async uncheck(
    selector: Selector,
    opts: domOpts = defaultDomOpts,
  ): Promise<boolean> {
    await this.navigatingPromise;

    if (opts.wait) {
      await this.wait(selector, opts.timeout);
    }

    log(`:uncheck() > un-checking checkbox '${selector}'`);

    return this.evaluate(selector => {
      requireSingular(document, selector).setAttribute('checked', 'false');
      return true;
    }, selector);
  }

  public async select(
    selector: Selector,
    option: string,
    opts: domOpts = defaultDomOpts,
  ): Promise<boolean> {
    await this.navigatingPromise;

    if (opts.wait) {
      await this.wait(selector, opts.timeout);
    }

    log(`:select() > selecting option '${option}' in '${selector}'`);

    return this.evaluate(selector => {
      var element = matchSelector(document, selector);
      if (element.length > 0) {
        element[0].setAttribute('value', option);
        return true;
      }
      return false;
    }, selector);
  }

  public async visible(
    selector: Selector,
    opts: domOpts = defaultDomOpts,
  ): Promise<boolean> {
    await this.navigatingPromise;

    if (opts.wait) {
      await this.wait(selector, opts.timeout);
    }

    log(`:visible() > seeing if '${selector}' is visible`);

    return this.evaluate(selector => {
      var element = requireSingular(document, selector);

      let style;
      try {
        style = window.getComputedStyle(element);
      } catch (e) {
        return false;
      }
      if (style.visibility === 'hidden' || style.display === 'none') {
        return false;
      }
      if (
        style.display === 'inline' ||
        style.display === 'inline-block' ||
        style.display === 'flex'
      ) {
        return true;
      }
      return (
        (<HTMLElement>element).offsetWidth > 0 &&
        (<HTMLElement>element).offsetHeight > 0
      );
    }, selector);
  }

  public async wait(
    waitParam: number | Selector,
    timeout?: number,
  ): Promise<any> {
    await this.navigatingPromise;

    if (typeof waitParam === 'number') {
      log(`:wait() > waiting ${waitParam} ms`);

      return new Promise(resolve => {
        setTimeout(() => resolve(), waitParam);
      });
    }

    timeout = timeout || this.defaultTimeout;

    log(
      `:wait() > waiting for selector "${waitParam}" a maximum of ${timeout}ms`,
    );

    await this.evaluate(waitForElement, waitParam, timeout);

    return true;
  }

  public async inject(src: string): Promise<boolean> {
    await this.navigatingPromise;

    const fileContents = fs.readFileSync(src, { encoding: 'utf-8' });
    const extension = path.extname(src);

    if (extension === '.js') {
      log(`:inject() > injecting JavaScript file from ${src}`);
      await this.runScript(fileContents);
      return true;
    }

    if (extension === '.css') {
      log(`:inject() > injecting CSS file from ${src}`);
      const cssInjectScript = function(content) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.innerHTML = content;
        document.body.appendChild(link);
      };
      await this.evaluate(cssInjectScript, fileContents);
      return true;
    }

    throw new Error(`:inject() > Unknown extension ${extension}`);
  }

  public async pageload(): Promise<boolean> {
    await this.navigatingPromise;
    const cdp = await this.getChromeCDP();

    log(`:pageload() > waiting for pageload to be called`);

    await cdp.Page.loadEventFired();

    return true;
  }

  public async cookie(name?: string, value?: string): Promise<any> {
    await this.navigatingPromise;
    const cdp = await this.getChromeCDP();

    log(
      `:cookie() > ${value
        ? `setting cookie ${name} to ${value}`
        : name ? `getting cookie ${name}` : `getting all cookies`}`,
    );

    const { cookies } = await cdp.Network.getAllCookies();

    if (value) {
      const url = await this.evaluate(() => window.location.href);
      const isSet = await cdp.Network.setCookie({ url, name, value });
      return isSet ? [{ name, value }] : null;
    }

    if (name) {
      const cookie = cookies.find(cookie => cookie.name === name);
      return cookie ? [{ name, value: cookie.value }] : null;
    }

    return cookies.map(cookie => ({ name: cookie.name, value: cookie.value }));
  }

  public async attr(
    selector: Selector,
    attribute: string,
    opts: domOpts = defaultDomOpts,
  ): Promise<string | null> {
    await this.navigatingPromise;

    if (opts.wait) {
      await this.wait(selector, opts.timeout);
    }

    log(`:attr() > getting '${selector}' attribute '${attribute}'`);

    return this.evaluate(
      (selector, attribute) => {
        const ele = matchSelector(document, selector);

        if (ele.length > 0) {
          return ele[0].getAttribute(attribute);
        }

        return null;
      },
      selector,
      attribute,
    );
  }

  public async coverage(
    src: string,
  ): Promise<{ total: number; unused: number; percentUnused: number } | Error> {
    await this.navigatingPromise;
    const cdp = await this.getChromeCDP();

    log(`:coverage() > getting coverage stats for ${src}`);

    // JS and CSS have similar data-structs, but are
    // retrieved via different mechanisms
    const jsCoverages = await cdp.Profiler.takePreciseCoverage();
    const jsCoverage = jsCoverages.result.find(
      scriptCoverage => scriptCoverage.url === src,
    );

    const styleSheet = this.styleSheetsLoaded.find(
      css => css.sourceURL === src,
    );
    const { coverage: cssCoverages } = await cdp.CSS.takeCoverageDelta();

    const startingResults = { total: 0, unused: 0 };

    // Stop monitors
    await cdp.Profiler.stopPreciseCoverage();
    await cdp.CSS.stopRuleUsageTracking();

    if (!jsCoverage && !styleSheet) {
      throw new Error(`Couldn't locate script ${src} on the page.`);
    }

    if (styleSheet && styleSheet.styleSheetId) {
      const coverageCollection = cssCoverages.filter(
        coverage => coverage.styleSheetId === styleSheet.styleSheetId,
      );
      const usedInfo = coverageCollection.reduce(
        (rangeAccum, range) => {
          const total =
            range.endOffset > rangeAccum.total
              ? range.endOffset
              : rangeAccum.total;
          const used = range.used ? range.endOffset - range.startOffset : 0;

          return {
            total,
            used: rangeAccum.used + used,
          };
        },
        { total: 0, used: 0 },
      );

      return {
        total: usedInfo.total,
        unused: usedInfo.total - usedInfo.used,
        percentUnused: (usedInfo.total - usedInfo.used) / usedInfo.total,
      };
    }

    if (jsCoverage && jsCoverage.functions && jsCoverage.functions.length) {
      const coverageData = jsCoverage.functions.reduce(
        (fnAccum, coverageStats) => {
          const functionStats = coverageStats.ranges.reduce(
            (rangeAccum, range) => {
              return {
                total:
                  range.endOffset > rangeAccum.total
                    ? range.endOffset
                    : rangeAccum.total,
                unused:
                  rangeAccum.unused +
                  (range.count === 0 ? range.endOffset - range.startOffset : 0),
              };
            },
            startingResults,
          );

          return {
            total:
              functionStats.total > fnAccum.total
                ? functionStats.total
                : fnAccum.total,
            unused: fnAccum.unused + functionStats.unused,
          };
        },
        startingResults,
      );

      return {
        ...coverageData,
        percentUnused: coverageData.unused / coverageData.total,
      };
    }

    return new Error(`Couldn't parse code coverge for script ${src}`);
  }

  public done(): void {
    log(`:done() > finished`);

    if (this.kill) {
      log(`:done() > closing chrome`);
      this.kill();
    }

    this.emit('done');
  }
}
