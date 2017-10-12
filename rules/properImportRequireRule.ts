import * as fs from 'fs';
import * as path from 'path';
import * as Lint from 'tslint';
import * as ts from 'typescript';

// True if es6 module
const module_cache: { [k: string]: boolean } = {};

function findModulePath(module_name: string): string {
  let current_dir = process.cwd();
  if (module_name.startsWith('./')) return ''; // Currently doesn't support local modules.

  while (true) {
    const current_path = path.join(current_dir, 'node_modules', module_name);
    if (fs.existsSync(current_path)) return current_path;

    const next_dir = path.dirname(current_dir);
    if (current_dir === next_dir) return '';
    current_dir = next_dir;
  }
}

function loadMainFile(module_name: string): string | undefined {
  const module_path = findModulePath(module_name);
  if (!module_path) return;

  const pkg = require(path.join(module_path, 'package.json'));
  let main_file_path = path.join(module_path, pkg.main || 'index.js');
  if (!fs.existsSync(main_file_path)) {
    if (main_file_path.match(/\.js/,)) return;
    main_file_path += '.js';
    if (!fs.existsSync(main_file_path)) return;
  }

  return fs.readFileSync(main_file_path, 'utf8');
}

// The walker takes care of all the work.
class ProperImportRequire extends Lint.RuleWalker {
  private createCustomFailure(es6: boolean, start: number, end: number, variable_name: string, module_name: string, quote: string) {
    if (es6) {
      const replacement = `import * as ${variable_name} from ${quote}${module_name}${quote};`;
      return this.createFailure(
        start,
        end,
        `${module_name} is using ES6 exports. Use ${replacement} instead.`,
        Lint.Replacement.replaceFromTo(start, end, replacement)
      )
    }

    const replacement = `import ${variable_name} = require(${quote}${module_name}${quote});`;
    return this.createFailure(
      start,
      end,
      `${module_name} is not using ES6 exports. Use ${replacement} instead.`,
      Lint.Replacement.replaceFromTo(start, end, replacement)
    )
  }

  public visitImportDeclaration(node: ts.ImportDeclaration) {
    const module_name = node.moduleSpecifier.getText().replace(/("|')/g, '');
    if (module_cache[module_name]) {
      return super.visitImportDeclaration(node);
    }

    const variable_name = ((node.importClause as ts.ImportClause).namedBindings as ts.NamespaceImport).name.escapedText as string;
    const quote = node.moduleSpecifier.getText()[0];

    if (module_cache[module_name] === false) {
      this.addFailure(this.createCustomFailure(
        false,
        node.getStart(),
        node.getWidth(),
        variable_name,
        module_name,
        quote
      ));
      return super.visitImportDeclaration(node);
    }

    const main_file = loadMainFile(module_name);
    if (main_file && !main_file.match(/__esModule/g)) {
      module_cache[module_name] = false;
      this.addFailure(this.createCustomFailure(
        false,
        node.getStart(),
        node.getWidth(),
        variable_name,
        module_name,
        quote
      ));
    }

    super.visitImportDeclaration(node);
  }

  public visitImportEqualsDeclaration(node: ts.ImportEqualsDeclaration) {
    const module_name = node.moduleReference.getChildren()[node.moduleReference.getChildCount() - 2].getText().replace(/("|')/g, '');
    if (module_cache[module_name] === false) {
      return super.visitImportEqualsDeclaration(node);
    }

    const variable_name = node.name.escapedText as string;
    const quote = node.moduleReference.getText().match(/'/g) ? `'` : `"`;

    if (module_cache[module_name]) {
      this.addFailure(this.createCustomFailure(
        true,
        node.getStart(),
        node.getWidth(),
        variable_name,
        module_name,
        quote
      ));
      super.visitImportEqualsDeclaration(node);
      return;
    }

    const main_file = loadMainFile(module_name);
    if (main_file && main_file.match(/__esModule/g)) {
      module_cache[module_name] = true;
      this.addFailure(this.createCustomFailure(
        true,
        node.getStart(),
        node.getWidth(),
        variable_name,
        module_name,
        quote
      ));
    }

    // call the base version of this visitor to actually parse this node
    super.visitImportEqualsDeclaration(node);
  }
}

export class Rule extends Lint.Rules.AbstractRule {
  public apply(sourceFile: ts.SourceFile): Lint.RuleFailure[] {
    return this.applyWithWalker(new ProperImportRequire(sourceFile, this.getOptions()));
  }
}
