# Brazil Workflow

For Brazil code changes

## Workspace
- Create workspaces under `/home/palkimas/workplace/`
- Use `brazil ws create --name <name>` to create a new workspace
- Always use a new workspace

## Git
- Always pull latest mainline before starting work: `git pull`
- Work directly on mainline — do not create feature branches
- Never run `git push`
- Squash all work into a single commit before creating a CR: `git reset --soft origin/mainline && git commit`
- Only modify files directly related to the task — do not fix unrelated issues
- Ensure the build passes on your final commit before submitting a CR

## Building
- Run `brazil-build` from the package root
- Use `bb` as a shorthand alias

## Code Reviews
- Before creating or updating a CR, pull latest: `git pull`
- Create a new CR: `cr -i <package> --summary "..." --description "..."`
- Update an existing CR: `cr --update-review CR-XXXXXX`
- Never use the `--parent` flag with `cr`
- Always run tests before submitting a CR
- Adhere CR description to the `.crux_template.md` if that file exists.