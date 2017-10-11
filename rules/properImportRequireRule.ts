import * as fs from 'fs';
import * as path from 'path';
import * as Lint from 'tslint';
import * as ts from 'typescript';

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

// The walker takes care of all the work.
class ProperImportRequire extends Lint.RuleWalker {
  public visitImportDeclaration(node: ts.ImportDeclaration) {
    const variable_name = ((node.importClause as ts.ImportClause).namedBindings as ts.NamespaceImport).name.escapedText;
    const quote = node.moduleSpecifier.getText()[0];
    const module_name = node.moduleSpecifier.getText().replace(/("|')/g, '');
    const module_path = findModulePath(module_name);

    if (module_path) {
      const pkg = require(path.join(module_path, 'package.json'));
      const main_file = fs.readFileSync(path.join(module_path, pkg.main), 'utf8');

      if (!main_file.match(/__esModule/g)) {
        const start = node.getStart();
        const end = node.getWidth();
        const replacement = `import ${variable_name} = require(${quote}${module_name}${quote});`;
        this.addFailure(this.createFailure(
          start,
          end,
          `${module_name} is not using ES6 exports. Use ${replacement} instead.`,
          Lint.Replacement.replaceFromTo(start, end, replacement)
        ));
      }
    }

    // call the base version of this visitor to actually parse this node
    super.visitImportDeclaration(node);
  }

  public visitImportEqualsDeclaration(node: ts.ImportEqualsDeclaration) {
    const variable_name = node.name.escapedText;
    const quote = node.moduleReference.getText().match(/'/g) ? `'` : `"`;
    const module_name = node.moduleReference.getChildren()[node.moduleReference.getChildCount() - 2].getText().replace(/("|')/g, '');
    const module_path = findModulePath(module_name);

    if (module_path) {
      const pkg = require(path.join(module_path, 'package.json'));
      const main_file = fs.readFileSync(path.join(module_path, pkg.main), 'utf8');

      if (main_file.match(/__esModule/g)) {
        const start = node.getStart();
        const end = node.getWidth();
        const replacement = `import * as ${variable_name} from ${quote}${module_name}${quote};`;
        this.addFailure(this.createFailure(
          start,
          end,
          `${module_name} is using ES6 exports. Use ${replacement} instead.`,
          Lint.Replacement.replaceFromTo(start, end, replacement)
        ));
      }
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
