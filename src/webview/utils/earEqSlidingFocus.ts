/** Position a liquid-glass focus element behind the active item in a strip. */
export function updateEarEqSlidingFocus(
  strip: HTMLElement,
  focus: HTMLElement,
  activeSelector: string,
): void {
  const active = strip.querySelector(activeSelector) as HTMLElement | null;
  if (!active) {
    focus.style.opacity = "0";
    return;
  }
  const stripRect = strip.getBoundingClientRect();
  const activeRect = active.getBoundingClientRect();
  focus.style.opacity = "1";
  focus.style.width = `${activeRect.width}px`;
  focus.style.height = `${activeRect.height}px`;
  focus.style.transform = `translate(${activeRect.left - stripRect.left}px, ${activeRect.top - stripRect.top}px)`;
}
