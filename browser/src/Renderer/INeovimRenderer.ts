import { IDeltaRegionTracker } from "./../DeltaRegionTracker"
import { IScreen } from "./../Screen"

export interface INeovimRenderer {
    start(element: HTMLElement): void

    redrawAll(screenInfo: IScreen): void

    update(screenInfo: IScreen, deltaRegionTracker: IDeltaRegionTracker): void

    onAction(action: any): void

    onResize(): void
}
