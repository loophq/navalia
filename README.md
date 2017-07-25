<img src="./assets/logo-color.png" alt="Navalia Logo" style="text-align: center;" width="300" >

[![npm version](https://badge.fury.io/js/navalia.svg)](https://badge.fury.io/js/navalia)
[![Build Status](https://travis-ci.org/joelgriffith/navalia.svg?branch=master)](https://travis-ci.org/joelgriffith/navalia)
[![dependencies Status](https://david-dm.org/joelgriffith/navalia/status.svg)](https://david-dm.org/joelgriffith/navalia)
[![styled with prettier](https://img.shields.io/badge/styled_with-prettier-ff69b4.svg)](https://github.com/prettier/prettier)

```bash
$ npm i -g navalia
$ navalia --port 5000
```

Drive a headless browser with ease by using GraphQL. Navalia exposes both a GraphQL front-end and a set of modules for painless browser automation. There's no clunky API to learn or plugins to install.

[View the library documentation here](https://joelgriffith.github.io/navalia/)

[Install the npm module to run the GraphiQL client](https://www.npmjs.com/package/navalia)

## Loop changes
A few updates here and there to fix some crashes we were getting in our usage.

Implemented `Selector.ts`, enabling more sophisticated element selection (e.g. `by.id('list-item').withDescendant(by.text('TODO item 1'))`) by traversing the DOM and testing the elements. Obviously not for everyone. We haven't noticed performance differences (since DOM traversing is done once or twice per action).

## Features

- Scrape webpage data, even from JavaScript-heavy sites.
- Run automated functional tests.
- Discover visual regressions in your site.
- Capture screenshots, pdfs, execute javascript, insert text, and more.
- Use any runtime or framework you want!

## GraphQL Front-end

![NavaliaQL](./assets/NavaliaQL.gif)

## Recipes

- [Functional Testing](https://codeburst.io/composable-end-to-end-tests-for-react-apps-2ec82170af62)

- [Website Code Coverage](https://codeburst.io/capturing-unused-application-code-2b7594a9fe06)

- [Visual Regression Testing](https://codeburst.io/automatic-visual-regression-testing-23cc06471dd)

## Roadmap

In no particular order, this is the vision of navalia going forward:

- [X] Expanded browser API (pdf rendering, network watching, more).
- [ ] Bring more vendors onto the framework.
- [ ] Better typings around externals with no @type support.
- [X] Parameterization on killing long-running jobs.
- [ ] Unit testing all features.
- [ ] Integration testing with the various vendors so our API's don't break when theirs do.
- [X] Travis, coveralls, greenkeeper, and other handy-dandy tools to automate chore tasks.
