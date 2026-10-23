export async function resolve(specifier, context, nextResolve) {
  if (specifier.endsWith('.module.css')) {
    return { url: 'data:text/javascript,export default new Proxy({}, {get: (_target, key) => String(key)})', shortCircuit: true }
  }
  return nextResolve(specifier, context)
}
