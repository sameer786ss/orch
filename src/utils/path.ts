export function getPathBaseName(pathStr: string): string {
  if (!pathStr) return ''
  const normalizedPath = pathStr.replace(/\\/g, '/').replace(/\/+$/, '')
  const parts = normalizedPath.split('/')
  return parts[parts.length - 1] || pathStr
}
