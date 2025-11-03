#!/bin/bash
# Script to add both import/ and import-x/ rule names to eslint-disable comments
# This allows the codebase to work with both old and new eslint-plugin-import versions

set -e

echo "Adding dual rule names for import rules..."

# Array of import rules to update
rules=(
    "export"
    "extensions"
    "first"
    "namespace"
    "no-commonjs"
    "no-default-export"
    "no-deprecated"
    "no-duplicates"
    "no-dynamic-require"
    "no-extraneous-dependencies"
    "no-internal-modules"
    "no-mutable-exports"
    "no-named-as-default-member"
    "no-nodejs-modules"
    "no-unassigned-import"
    "no-unresolved"
    "no-unused-modules"
    "order"
    "prefer-default-export"
)

for rule in "${rules[@]}"; do
    old_rule="import/${rule}"
    new_rule="import-x/${rule}"
    
    echo "Processing rule: ${old_rule} -> adding ${new_rule}"
    
    # Use sd to add the new rule name after the old one in all files
    # This matches eslint-disable or eslint-disable-next-line with the import/ rule
    # and adds the import-x/ variant if not already present
    find . -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" -o -name "*.cjs" -o -name "*.mjs" \) \
        -not -path "*/node_modules/*" \
        -not -path "*/.git/*" \
        -not -path "*/dist/*" \
        -not -path "*/lib/*" \
        -exec grep -l "${old_rule}" {} \; 2>/dev/null | \
    while read -r file; do
        if ! grep -q "${new_rule}" "$file" 2>/dev/null; then
            sd "(eslint-disable(-next-line)?[^\\n]*${old_rule})" "\$1, ${new_rule}" "$file"
            echo "  Updated: $file"
        fi
    done
done

echo ""
echo "Done! Please review the changes with: git diff"
