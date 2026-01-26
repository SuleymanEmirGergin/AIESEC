/**
 * Snaps bounding box coordinates to a grid to normalize requests and improve cache efficiency.
 * 
 * @param bbox [minLat, minLon, maxLat, maxLon]
 * @param gridSize Degrees to snap to (default 0.01 ~= 1.1km)
 */
export function snapBBoxToGrid(
  bbox: [number, number, number, number],
  gridSize: number = 0.01
): [number, number, number, number] {
  const quantize = (val: number) => Math.round(val / gridSize) * gridSize;

  return [
    parseFloat(quantize(bbox[0]).toFixed(4)),
    parseFloat(quantize(bbox[1]).toFixed(4)),
    parseFloat(quantize(bbox[2]).toFixed(4)),
    parseFloat(quantize(bbox[3]).toFixed(4)),
  ];
}

/**
 * Normalizes latitude and longitude to a grid.
 */
export function snapCoordToGrid(coord: number, gridSize: number = 0.01): number {
  return parseFloat((Math.round(coord / gridSize) * gridSize).toFixed(4));
}
