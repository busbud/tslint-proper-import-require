# tslint-proper-import-require

A TSLint rule that verifies whether you should be using the `import from` or `import require` syntax when importing an external module to follow the ES6 spec, without depending on workarounds supplied by Typescript that have the potential to be removed in the future.

The rule works by resolving your specified module and checking if `__esModule` exists in the modules main exported file, and then reports accordingly.

## Usage

In your `tslint.json` set the following:

```json
{
  "extends": ["tslint-proper-import-require"],
  "rules": {
    "proper-import-require": true
  }
}
```

## Examples

#### Importing an < ES6 module

__example-module/index.js__

```
module.exports = function() {
  return 'foo':
}
```

__index.ts__
```
import * as ExampleModule from 'example-module'; // Incorrect
import ExampleModule = require('example-module'); // Correct

```

#### Importing an ES6 module

__example-module/index.js__

```
export function foo() {
  return 'bar';
}
```

__index.ts__
```
import * as ExampleModule from 'example-module'; // Correct
import { foo } from 'example-module'; // Correct
import ExampleModule = require('example-module'); // Incorrect

```
