import type { FrameGraph, IFrameGraphPass, FrameGraphTextureHandle, FrameGraphRenderContext } from "../index.js";
import { Observable } from "../Misc/observable.js";
/**
 * Represents a task in a frame graph.
 * @experimental
 */
export declare abstract class FrameGraphTask {
    protected readonly _frameGraph: FrameGraph;
    private readonly _passes;
    private readonly _passesDisabled;
    protected _name: string;
    /**
     * The name of the task.
     */
    get name(): string;
    set name(value: string);
    protected _disabled: boolean;
    /**
     * Whether the task is disabled.
     */
    get disabled(): boolean;
    set disabled(value: boolean);
    /**
     * Gets the render passes of the task.
     */
    get passes(): IFrameGraphPass[];
    /**
     * Gets the disabled render passes of the task.
     */
    get passesDisabled(): IFrameGraphPass[];
    /**
     * The (texture) dependencies of the task (optional).
     */
    dependencies?: Set<FrameGraphTextureHandle>;
    /**
     * Records the task in the frame graph. Use this function to add content (render passes, ...) to the task.
     * @param skipCreationOfDisabledPasses If true, the disabled passe(s) won't be created.
     */
    abstract record(skipCreationOfDisabledPasses?: boolean): void;
    /**
     * An observable that is triggered after the textures have been allocated.
     */
    onTexturesAllocatedObservable: Observable<FrameGraphRenderContext>;
    /**
     * An observable that is triggered before the task is executed.
     */
    onBeforeTaskExecute: Observable<FrameGraphTask>;
    /**
     * An observable that is triggered after the task is executed.
     */
    onAfterTaskExecute: Observable<FrameGraphTask>;
    /**
     * Checks if the task is ready to be executed.
     * @returns True if the task is ready to be executed, else false.
     */
    isReady(): boolean;
    /**
     * Disposes of the task.
     */
    dispose(): void;
    /**
     * Constructs a new frame graph task.
     * @param name The name of the task.
     * @param frameGraph The frame graph this task is associated with.
     */
    constructor(name: string, frameGraph: FrameGraph);
    /** @internal */
    _reset(): void;
    /** @internal */
    _addPass(pass: IFrameGraphPass, disabled: boolean): void;
    /** @internal */
    _checkTask(): void;
    /** @internal */
    _execute(): void;
    private _checkSameRenderTarget;
}
