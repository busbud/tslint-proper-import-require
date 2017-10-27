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
  try {
    return fs.readFileSync(require.resolve(module_path), 'utf8');
  } catch {
    return;
  }
}

// The walker takes care of all the work.
class ProperImportRequire extends Lint.RuleWalker {
  public visitImportDeclaration(node: ts.ImportDeclaration) {
    const module_name = node.moduleSpecifier.getText().replace(/("|')/g, '');
    if (module_cache[module_name] || node.getText().includes('{')) {
      return super.visitImportDeclaration(node);
    }

    const variable_name = node.getText()
      .split('import')[1]
      .split('from')[0]
      .replace('* as', '')
      .trim();

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

  private createCustomFailure(es6: boolean, start: number, length: number, variable_name: string, module_name: string, quote: string) {
    if (es6) {
      const replacement = `import * as ${variable_name} from ${quote}${module_name}${quote};`;
      return this.createFailure(
        start,
        length,
        `${module_name} is using ES6 exports. Use ${replacement} instead.`,
        Lint.Replacement.replaceFromTo(start, start + length, replacement)
      );
    }

    const replacement = `import ${variable_name} = require(${quote}${module_name}${quote});`;
    return this.createFailure(
      start,
      length,
      `${module_name} is not using ES6 exports. Use ${replacement} instead.`,
      Lint.Replacement.replaceFromTo(start, start + length, replacement)
    );
  }
}

export class Rule extends Lint.Rules.AbstractRule {
  public apply(sourceFile: ts.SourceFile): Lint.RuleFailure[] {
    return this.applyWithWalker(new ProperImportRequire(sourceFile, this.getOptions()));
  }
}
