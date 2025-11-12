import type { Nullable, FrameGraphContext, IFrameGraphPass, FrameGraphTask } from "../../index.js";
/**
 * Base class for a frame graph pass.
 */
export declare class FrameGraphPass<T extends FrameGraphContext> implements IFrameGraphPass {
    name: string;
    protected readonly _parentTask: FrameGraphTask;
    protected readonly _context: T;
    private _executeFunc;
    /**
     * Whether the pass is disabled. Disabled passes will be skipped during execution.
     */
    disabled: boolean;
    /** @internal */
    constructor(name: string, _parentTask: FrameGraphTask, _context: T);
    /**
     * Executes the pass.
     * @param func The function to execute for the pass.
     */
    setExecuteFunc(func: (context: T) => void): void;
    /** @internal */
    _execute(): void;
    /** @internal */
    _isValid(): Nullable<string>;
}
