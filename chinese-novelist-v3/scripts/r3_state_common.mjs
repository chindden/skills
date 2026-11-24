/**
 * R3 experimental bootstrap state.
 * The legacy v3 schema remains 1; R3 uses a separate opt-in namespace.
 * Bootstrap state does not grant any writing or approval permissions.
 */
export const R3_BOOTSTRAP_SCHEMA_VERSION = 1;

export function newR3BootstrapState() {
  return {
    schemaVersion: R3_BOOTSTRAP_SCHEMA_VERSION,
    mode: 'experimental',
    status: 'bootstrap',
    reviewPolicy: 'every_chapter',
    corePlan: {status: 'pending'},
    volumeCheckpoints: {},
    finalRefinement: {status: 'pending'}
  };
}

export function hasR3Namespace(plan) {
  return !!plan?.v3 && Object.prototype.hasOwnProperty.call(plan.v3, 'r3');
}

export function validR3Namespace(state) {
  return !!state && typeof state === 'object' && !Array.isArray(state) &&
    state.schemaVersion === R3_BOOTSTRAP_SCHEMA_VERSION &&
    state.mode === 'experimental';
}
