type XYZ = { x: number; y: number; z: number };

/** Whether the segment from the viewer to the marker clears the Earth's surface. */
export function clearsGlobe(eye: XYZ, marker: XYZ, radius: number) {
  const x = marker.x - eye.x, y = marker.y - eye.y, z = marker.z - eye.z;
  const lengthSquared = x*x + y*y + z*z;
  if (!lengthSquared) return true;
  const t = Math.max(0, Math.min(1, -(eye.x*x + eye.y*y + eye.z*z) / lengthSquared));
  return (eye.x + t*x)**2 + (eye.y + t*y)**2 + (eye.z + t*z)**2 >= radius**2;
}
