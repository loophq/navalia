/** Utilities for matching selectors in browsers. */

export type Selector = {
  /** Matches a raw css selector. (NOT SUPPORTED WITH Ancestor/Descendant). */
  css?: string;
  /** Matches an element with the attribute data-testID=id. */
  id?: string;
  /** Matches the most specific element containing exactly the text provided. */
  fullText?: string;
  /** Matches the most specific element that contains the text provided. */
  partialText?: string;
};

export type ElementSelector = {
  selector: Selector;
  ancestor?: ElementSelector;
  descendant?: ElementSelector;
};

function selectorObjectString(fun: Function) {
  return `
  ${String(fun)}
  Selector_1.${fun.name} = ${fun.name};
  `;
}

export const StringifiedContext = `
  var Selector_1 = {};
  ${selectorObjectString(requireSingular)}
  ${selectorObjectString(match)}
  ${selectorObjectString(findIn)}
  ${selectorObjectString(matches)}
  ${selectorObjectString(immediateMatch)}
  ${selectorObjectString(makeIterable)}
  ${selectorObjectString(getChildren)}
  ${selectorObjectString(getParent)}
  `;

export function requireSingular(
  document: Document,
  selector: ElementSelector,
): Element {
  const matches = match(document, selector);
  if (matches.length == 0) {
    throw new Error('Failed to match: ' + selector);
  } else if (matches.length > 1) {
    throw new Error(
      `Matched ${matches.length} elements with: ${JSON.stringify(selector)}`,
    );
  }
  return matches[0];
}

export function match(
  document: Document,
  selector: ElementSelector,
): Array<Element> {
  if (
    selector.selector.id != null &&
    selector.ancestor == null &&
    selector.descendant == null
  ) {
    let element = document.querySelector(
      '[data-testID=' + JSON.stringify(selector.selector.id) + ']',
    );
    return element == null ? [] : [element];
  }
  if (
    selector.selector.css != null &&
    selector.ancestor == null &&
    selector.descendant == null
  ) {
    let element = document.querySelector(selector.selector.css);
    return element == null ? [] : [element];
  }
  const matches = findIn(
    document,
    selector,
    document.getElementsByTagName('body')[0],
    getChildren,
  );
  // Return the most specific nodes available.
  return matches.filter(node => {
    return !matches.some(other => other !== node && node.contains(other));
  });
}

/** Recursively finds elements that match the given selector. */
function findIn(
  document: Document,
  selector: ElementSelector,
  doc: HTMLElement,
  getNextNodes: (ele: HTMLElement) => IterableNode,
): Array<HTMLElement> {
  if (doc == null) {
    return [];
  }
  let found: Array<HTMLElement> = [];
  if (matches(document, selector, doc)) {
    found.push(doc);
  }
  getNextNodes(doc).forEach(
    function(found: Array<HTMLElement>, document: Document, node: HTMLElement) {
      if (node == (<Node>document)) {
        return;
      }
      findIn(document, selector, node, getNextNodes).forEach(
        function(element) {
          this.push(element);
        }.bind(found),
      );
    }.bind(null, found, document),
  );
  return found;
}

/** Checks whether the given element matches the selector (including checking ancestors/descendants). */
function matches(
  document: Document,
  selector: ElementSelector,
  doc: HTMLElement,
): boolean {
  if (doc == null) {
    return false;
  }
  if (!immediateMatch(selector.selector, doc)) {
    return false;
  }
  if (
    selector.descendant != null &&
    findIn(document, selector.descendant, doc, getChildren).length == 0
  ) {
    return false;
  }
  if (
    selector.ancestor != null &&
    findIn(document, selector.ancestor, <HTMLElement>doc.parentNode, getParent)
      .length == 0
  ) {
    return false;
  }
  return true;
}

/** Checks whether the element matches the per-element selector. */
function immediateMatch(selector: Selector, doc: HTMLElement): boolean {
  return (
    (selector.id != null && doc.getAttribute('data-testID') === selector.id) ||
    (selector.fullText != null && doc.innerText == selector.fullText) ||
    (selector.partialText != null &&
      doc.innerText != null &&
      doc.innerText.includes(selector.partialText))
  );
}

function makeIterable(item: Node | null): IterableNode {
  if (item == null) {
    return {
      forEach: () => {},
    };
  } else {
    return {
      forEach: callback => callback(item),
    };
  }
}

function getChildren(node: HTMLElement): IterableNode {
  if (node == null || node.children == null) {
    return makeIterable(null);
  }
  return {
    forEach: callback => {
      for (let i = 0; i < node.children.length; i++) {
        callback(node.children.item(i));
      }
    },
  };
}

function getParent(node: Node): IterableNode {
  return makeIterable(node && node.parentNode);
}

type IterableNode = {
  forEach: (callback: (node: Node) => void) => void;
};
