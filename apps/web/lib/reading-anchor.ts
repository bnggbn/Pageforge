// Rendered blocks occur in reading order. Find the last block above the viewport
// with logarithmic layout reads rather than walking the whole document per scroll.
export function readingAnchor(
  blocks: readonly HTMLElement[],
  top: number,
): HTMLElement | undefined {
  let low = 0
  let high = blocks.length - 1
  let anchor = blocks[0]
  while (low <= high) {
    const index = (low + high) >>> 1
    if (blocks[index].getBoundingClientRect().top <= top) {
      anchor = blocks[index]
      low = index + 1
    } else {
      high = index - 1
    }
  }
  return anchor
}
