/* Immutable release identity. Opening recruitment requires an authored code change. */
(function (global) {
  'use strict';
  const VERSION = 'kitchen-v2.0.0';
  const PILOT_VERSION = 'kitchen-pilot-v2.0.0';
  const CONSENT_VERSION = 'kitchen-formal-2026-11-08-v2';
  const PILOT_CONSENT_VERSION = 'kitchen-pilot-2026-11-08-v2';
  const recruitmentOpen = true;
  function freezeDeep(value) {
    Object.values(value).forEach(item => { if (item && typeof item === 'object') freezeDeep(item); });
    return Object.freeze(value);
  }
  const configurations = freezeDeep({
    formal: {
      collectionMode: 'formal', protocolVersion: VERSION, consentVersion: CONSENT_VERSION,
      testOnly: false, recruitmentOpen,
      experiments: {
        bakery: { experiment: 'seev_bakery_v2', version: 'seev-v2.0.0', layoutId: 'bakery-spread-v2' },
        juice: { experiment: 'pcp_juice_v1', version: 'pcp-v1.0.0' }
      }
    },
    pilot: {
      collectionMode: 'pilot', protocolVersion: PILOT_VERSION, consentVersion: PILOT_CONSENT_VERSION,
      testOnly: true, recruitmentOpen,
      experiments: {
        bakery: { experiment: 'test_seev_bakery_v2', version: 'test-seev-v2.0.0', layoutId: 'bakery-spread-v2' },
        juice: { experiment: 'test_pcp_juice_v1', version: 'test-pcp-v1.0.0' }
      }
    }
  });
  function getMode(search) {
    const query = search === undefined ? global.location?.search || '' : String(search);
    return new URLSearchParams(query).get('mode') === 'pilot' ? 'pilot' : 'formal';
  }
  function getConfig(mode = getMode()) {
    if (mode !== 'formal' && mode !== 'pilot') throw new Error('采集模式不正确，请重新打开实验页面。');
    return configurations[mode];
  }
  function getEngineOptions(mode = getMode(), options = {}) {
    const config = getConfig(mode);
    if (options.collectionMode !== undefined && options.collectionMode !== mode) throw new Error('采集模式与实验设置不一致。');
    if (mode === 'formal' && (options.simulation === true || options.testOnly === true)) {
      throw new Error('正式采集不能使用模拟时钟或测试标记。');
    }
    return { ...options, collectionMode: mode, testOnly: config.testOnly, simulation: mode === 'pilot' && options.simulation === true };
  }
  const api = Object.freeze({ VERSION, PILOT_VERSION, CONSENT_VERSION, PILOT_CONSENT_VERSION,
    recruitmentOpen, experiments: configurations.formal.experiments, getMode, getConfig, getEngineOptions });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.AttentionProtocol = api;
})(typeof window !== 'undefined' ? window : globalThis);
