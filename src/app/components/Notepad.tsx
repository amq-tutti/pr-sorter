import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { NotepadLayout } from '../types';

type NotepadProps = {
    notes: string;
    layout: NotepadLayout | null;
    onNotesChange(notes: string): void;
    onLayoutChange(layout: NotepadLayout): void;
};

type Viewport = { width: number; height: number };

type DragGesture = {
    mode: 'move' | 'resize';
    pointerId: number;
    startX: number;
    startY: number;
    startLayout: NotepadLayout;
    layout: NotepadLayout;
};

const VIEWPORT_MARGIN = 8;
const MIN_WIDTH = 220;
const MIN_HEIGHT = 160;
const DEFAULT_WIDTH = 320;
const DEFAULT_HEIGHT = 280;
// Leaves room for the trigger button (44px tall, 16px from the edge) below the default position.
const DEFAULT_BOTTOM_OFFSET = 72;

export function Notepad({notes, layout, onNotesChange, onLayoutChange}: NotepadProps) {
    const [open, setOpen] = useState(false);
    const [viewport, setViewport] = useState<Viewport>(currentViewport);
    const [draftLayout, setDraftLayout] = useState<NotepadLayout | null>(null);
    const gestureRef = useRef<DragGesture | null>(null);

    useEffect(() => {
        if (!open) {
            return;
        }

        const updateViewport = () => setViewport(currentViewport());
        updateViewport();
        window.addEventListener('resize', updateViewport);
        return () => window.removeEventListener('resize', updateViewport);
    }, [open]);

    // Clamped at render time rather than when saved, so shrinking the window and growing it back
    // restores the spot the user picked instead of leaving the panel squeezed.
    const shownLayout = clampLayout(draftLayout ?? layout ?? defaultLayout(viewport), viewport);

    function startGesture(event: ReactPointerEvent<HTMLElement>, mode: DragGesture['mode']): void {
        if (event.button !== 0 || (event.target as HTMLElement).closest('button')) {
            return;
        }

        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        gestureRef.current = {
            mode,
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            startLayout: shownLayout,
            layout: shownLayout,
        };
    }

    function moveGesture(event: ReactPointerEvent<HTMLElement>): void {
        const gesture = gestureRef.current;
        if (!gesture || gesture.pointerId !== event.pointerId) {
            return;
        }

        const dx = event.clientX - gesture.startX;
        const dy = event.clientY - gesture.startY;
        const start = gesture.startLayout;
        const next = gesture.mode === 'move'
            ? {...start, x: start.x + dx, y: start.y + dy}
            : {
                ...start,
                // Capped so growing past the viewport edge doesn't shove the panel the other way.
                width: Math.min(start.width + dx, viewport.width - start.x - VIEWPORT_MARGIN),
                height: Math.min(start.height + dy, viewport.height - start.y - VIEWPORT_MARGIN),
            };

        gesture.layout = clampLayout(next, viewport);
        setDraftLayout(gesture.layout);
    }

    function endGesture(event: ReactPointerEvent<HTMLElement>): void {
        const gesture = gestureRef.current;
        if (!gesture || gesture.pointerId !== event.pointerId) {
            return;
        }

        gestureRef.current = null;
        setDraftLayout(null);
        // A plain click on the header shouldn't pin the default corner position.
        if (!sameLayout(gesture.layout, gesture.startLayout)) {
            onLayoutChange(gesture.layout);
        }
    }

    const gestureHandlers = {
        onPointerMove: moveGesture,
        onPointerUp: endGesture,
        onPointerCancel: endGesture,
    };

    return (
        <>
            <button
                className={`notepad-trigger${open ? ' notepad-trigger--active' : ''}`}
                type="button"
                title={open ? 'Close notes' : 'Open notes'}
                aria-label={open ? 'Close notes' : 'Open notes'}
                aria-expanded={open}
                aria-controls="notepad"
                onClick={() => setOpen((current) => !current)}
            >
                <svg className="notepad-trigger__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path
                        d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8M8 17h5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                </svg>
            </button>
            {open ? (
                <div
                    id="notepad"
                    className="notepad"
                    role="dialog"
                    aria-label="Notes"
                    style={{
                        left: shownLayout.x,
                        top: shownLayout.y,
                        width: shownLayout.width,
                        height: shownLayout.height,
                    }}
                >
                    <div className="notepad__header" onPointerDown={(event) => startGesture(event, 'move')} {...gestureHandlers}>
                        <span className="notepad__title">Notes</span>
                        <button className="notepad__close" type="button" aria-label="Close notes" onClick={() => setOpen(false)}>
                            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                                <path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
                            </svg>
                        </button>
                    </div>
                    <textarea
                        className="notepad__text"
                        value={notes}
                        placeholder="Write anything here. It's saved in this browser."
                        autoFocus
                        onChange={(event) => onNotesChange(event.target.value)}
                    />
                    <div
                        className="notepad__resize"
                        aria-hidden="true"
                        onPointerDown={(event) => startGesture(event, 'resize')}
                        {...gestureHandlers}
                    />
                </div>
            ) : null}
        </>
    );
}

function currentViewport(): Viewport {
    // clientWidth/clientHeight exclude scrollbars, matching what position: fixed lays out against.
    return {width: document.documentElement.clientWidth, height: document.documentElement.clientHeight};
}

function defaultLayout(viewport: Viewport): NotepadLayout {
    return {
        x: viewport.width - DEFAULT_WIDTH - 16,
        y: viewport.height - DEFAULT_HEIGHT - DEFAULT_BOTTOM_OFFSET,
        width: DEFAULT_WIDTH,
        height: DEFAULT_HEIGHT,
    };
}

function clampLayout(layout: NotepadLayout, viewport: Viewport): NotepadLayout {
    const width = clamp(layout.width, MIN_WIDTH, viewport.width - VIEWPORT_MARGIN * 2);
    const height = clamp(layout.height, MIN_HEIGHT, viewport.height - VIEWPORT_MARGIN * 2);

    return {
        x: clamp(layout.x, VIEWPORT_MARGIN, viewport.width - width - VIEWPORT_MARGIN),
        y: clamp(layout.y, VIEWPORT_MARGIN, viewport.height - height - VIEWPORT_MARGIN),
        width,
        height,
    };
}

/** Like Math.min(Math.max(value, min), max), except `min` wins when the range is inverted (tiny viewports). */
function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(value, max));
}

function sameLayout(a: NotepadLayout, b: NotepadLayout): boolean {
    return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}
