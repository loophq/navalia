import { ElementSelector, match, requireSingular } from './Selector';
export function waitForElement(
  selector: ElementSelector,
  timeout: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeOutId = setTimeout(() => {
      reject(
        `Selector "${JSON.stringify(
          selector,
        )}" failed to appear in ${timeout} ms`,
      );
    }, timeout);

    if (match(document, selector).length > 0) return resolve();

    const observer = new MutationObserver(function(_mutations, observation) {
      const found = match(document, selector);
      if (found.length > 0) {
        observation.disconnect();
        clearTimeout(timeOutId);
        return resolve();
      }
    });

    // start observing
    observer.observe(document, {
      childList: true,
      subtree: true,
    });
  });
}

export function getPageURL(): string {
  return document.location.href;
}

export function click(selector: ElementSelector): boolean {
  const element = requireSingular(document, selector);
  const event = document.createEvent('MouseEvent');
  event.initEvent('click', true, true);
  element.dispatchEvent(event);
  return true;
}

export function html(selector: ElementSelector): string {
  return requireSingular(document, selector).outerHTML;
}
