import "monaco-editor/editor/browser/coreCommands.js";
import "monaco-editor/editor/contrib/tokenization/browser/tokenization.js";
import "monaco-editor/editor/contrib/find/browser/findController.js";
import "monaco-editor/editor/contrib/wordOperations/browser/wordOperations.js";
import "monaco-editor/editor/contrib/bracketMatching/browser/bracketMatching.js";
import "monaco-editor/languages/definitions/python/register.js";
import "monaco-editor/languages/definitions/sql/register.js";
globalThis.MonacoEnvironment = {
  getWorkerUrl: () => "/editor-assets/editor.worker.js",
};
export * from "monaco-editor/editor/editor.api.js";
