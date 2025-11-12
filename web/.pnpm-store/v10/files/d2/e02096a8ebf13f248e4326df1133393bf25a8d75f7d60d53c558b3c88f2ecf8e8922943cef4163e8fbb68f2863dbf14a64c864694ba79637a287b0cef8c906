/**
 * Base class for a frame graph pass.
 */
export class FrameGraphPass {
    /** @internal */
    constructor(name, _parentTask, _context) {
        this.name = name;
        this._parentTask = _parentTask;
        this._context = _context;
        /**
         * Whether the pass is disabled. Disabled passes will be skipped during execution.
         */
        this.disabled = false;
    }
    /**
     * Executes the pass.
     * @param func The function to execute for the pass.
     */
    setExecuteFunc(func) {
        this._executeFunc = func;
    }
    /** @internal */
    _execute() {
        if (!this.disabled) {
            this._executeFunc(this._context);
        }
    }
    /** @internal */
    _isValid() {
        return this._executeFunc !== undefined ? null : "Execute function is not set (call setExecuteFunc to set it)";
    }
}
//# sourceMappingURL=pass.js.map