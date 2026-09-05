"""Rule for running typedoc using Bazel-managed Node.js.

The wrapper runs typedoc from the runfiles copy of the package (so the .ts
sources and node_modules resolve) and writes into the workspace build directory.
"""

def _typedoc_impl(ctx):
    typedoc_bin = ctx.attr.typedoc_binary[DefaultInfo].files_to_run.executable
    is_windows = ctx.target_platform_has_constraint(ctx.attr._windows_constraint[platform_common.ConstraintValueInfo])

    if is_windows:
        script = ctx.actions.declare_file(ctx.label.name + ".bat")
        ctx.actions.write(script, _WINDOWS_TEMPLATE.format(
            config = ctx.file.config.basename,
            package = ctx.label.package.replace("/", "\\\\"),
            typedoc_bin = typedoc_bin.short_path.replace("/", "\\\\"),
        ), is_executable = True)
    else:
        script = ctx.actions.declare_file(ctx.label.name + ".sh")
        ctx.actions.write(script, _UNIX_TEMPLATE.format(
            config = ctx.file.config.basename,
            package = ctx.label.package,
            typedoc_bin = typedoc_bin.short_path,
        ), is_executable = True)

    runfiles = ctx.runfiles(files = ctx.files.data + [ctx.file.config])
    runfiles = runfiles.merge(ctx.attr.typedoc_binary[DefaultInfo].default_runfiles)
    return [DefaultInfo(executable = script, runfiles = runfiles)]

_UNIX_TEMPLATE = """#!/usr/bin/env bash
set -euo pipefail
RUNFILES="$(cd "$0.runfiles" && pwd)"
DEST="$BUILD_WORKSPACE_DIRECTORY/build/docs/api/javascript"
cd "$RUNFILES/_main/{package}"

# Set BAZEL_BINDIR to suppress rules_js error for non-build actions
export BAZEL_BINDIR="."

# Clean destination to prevent stale files
rm -rf "$DEST"
mkdir -p "$DEST"

"$RUNFILES/_main/{typedoc_bin}" --options {config} --out "$DEST" "$@"

if [[ -f "$DEST/index.html" ]]; then
    echo "Documentation generated successfully at $DEST"
else
    echo "ERROR: Documentation was not generated"
    exit 1
fi
"""

_WINDOWS_TEMPLATE = """@echo off
set RUNFILES=%~dp0.runfiles
set DEST=%BUILD_WORKSPACE_DIRECTORY%\\build\\docs\\api\\javascript
cd /d "%RUNFILES%\\_main\\{package}"
set BAZEL_BINDIR=.

if exist "%DEST%" rmdir /s /q "%DEST%"
mkdir "%DEST%"

"%RUNFILES%\\_main\\{typedoc_bin}" --options {config} --out "%DEST%" %*

if exist "%DEST%\\index.html" (
    echo Documentation generated successfully at %DEST%
) else (
    echo ERROR: Documentation was not generated
    exit /b 1
)
"""

typedoc = rule(
    implementation = _typedoc_impl,
    executable = True,
    attrs = {
        "config": attr.label(
            mandatory = True,
            allow_single_file = [".json"],
        ),
        "data": attr.label_list(
            allow_files = True,
        ),
        "typedoc_binary": attr.label(
            mandatory = True,
            executable = True,
            cfg = "target",
            doc = "The typedoc binary target from npm",
        ),
        "_windows_constraint": attr.label(
            default = "@platforms//os:windows",
        ),
    },
)
