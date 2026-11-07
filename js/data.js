(function (global) {
  'use strict';

  var PROJECT_CODE = '8P4BGM';
  var CONSENT_VERSION = '2026-11-07.3';
  var FORMAL_CONSENT_VERSION = 'kitchen-formal-2026-11-08-v1';
  var PILOT_CONSENT_VERSION = 'kitchen-pilot-2026-11-08-v1';
  var RELEASE_EXPERIMENTS = {
    seev_bakery_v1: { mode: 'formal', protocol: 'kitchen-v1.0.0', version: 'seev-v1.0.0', family: 'seev' },
    pcp_juice_v1: { mode: 'formal', protocol: 'kitchen-v1.0.0', version: 'pcp-v1.0.0', family: 'pcp' },
    test_seev_bakery_v1: { mode: 'pilot', protocol: 'kitchen-pilot-v1.0.0', version: 'test-seev-v1.0.0', family: 'seev' },
    test_pcp_juice_v1: { mode: 'pilot', protocol: 'kitchen-pilot-v1.0.0', version: 'test-pcp-v1.0.0', family: 'pcp' }
  };
  var BASE_URL = 'https://attention-lab-production.up.railway.app';
  var STORAGE_KEY = 'attention-playground.stage1.session.v1';
  var PILOT_KEY = 'attention-kitchen.stage2.seev-pilots.v2';
  var PILOT_EXPERIMENTS = ['seev_bakery_stage2', 'seev_bakery_stage3', 'pcp_juice_stage3'];
  var pilotEntries = [];
  var pilotStorageAvailable = true;
  var pilotRequests = Object.create(null);
  var REQUEST_TIMEOUT = 16000;
  var memorySession = null;
  var storageAvailable = true;
  var activeRequest = null;
  var selectedMode;
  var modeSessions = Object.create(null);

  function copy(value) {
    return value == null ? null : JSON.parse(JSON.stringify(value));
  }

  function randomToken() {
    if (global.crypto && typeof global.crypto.randomUUID === 'function') {
      return global.crypto.randomUUID();
    }
    if (global.crypto && typeof global.crypto.getRandomValues === 'function') {
      var bytes = new Uint8Array(16);
      global.crypto.getRandomValues(bytes);
      return Array.prototype.map.call(bytes, function (b) {
        return b.toString(16).padStart(2, '0');
      }).join('');
    }
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 14);
  }

  function releaseConfig(name) { return Object.prototype.hasOwnProperty.call(RELEASE_EXPERIMENTS, name) ? RELEASE_EXPERIMENTS[name] : null; }
  function consentVersionFor(mode) { return mode === 'formal' ? FORMAL_CONSENT_VERSION : mode === 'pilot' ? PILOT_CONSENT_VERSION : CONSENT_VERSION; }
  function sessionKey(mode) { return mode === 'formal' || mode === 'pilot' ? 'attention-kitchen.release.' + mode + '.session.v1' : STORAGE_KEY; }
  function resultsKey(mode) { return mode === 'formal' || mode === 'pilot' ? 'attention-kitchen.release.' + mode + '.results.v1' : PILOT_KEY; }
  function pageMode() {
    if (selectedMode !== undefined) return selectedMode;
    if (!global.location) return null;
    return /(?:^|[?&])mode=pilot(?:&|$)/.test(global.location.search || '') ? 'pilot' : 'formal';
  }

  function validateParticipantId(value, mode) {
    var normalized = typeof value === 'string' ? value.trim() : '';
    var valid = /^[A-Za-z0-9_-]{3,24}$/.test(normalized) &&
      !(mode === 'formal' && /^(?:test|qa|sim|pilot|demo|auto)(?:[_-]|$)/i.test(normalized));
    return {
      valid: valid,
      value: normalized,
      message: valid ? '' : mode === 'formal' ? '正式参加请使用正式编号，不能使用 test、qa、sim 等测试前缀；不要填写姓名、手机号或学号。' : '编号请用 3–24 位英文字母、数字、短横线或下划线，不要填写姓名、手机号或学号。'
    };
  }

  function generateParticipantId(mode) {
    return (mode === 'formal' ? 'P_' : 'test_') + randomToken().replace(/[^a-z0-9]/gi, '').slice(0, 10);
  }

  function readStoredSession() {
    try {
      var raw = global.localStorage.getItem(sessionKey(pageMode()));
      if (!raw) return;
      var parsed = JSON.parse(raw);
      if (parsed && parsed.schemaVersion === 1 && parsed.project === PROJECT_CODE &&
          (parsed.collectionMode || null) === pageMode() &&
          (parsed.collectionMode ? parsed.testOnly === (parsed.collectionMode === 'pilot') &&
            ['formal', 'pilot'].indexOf(parsed.collectionMode) >= 0 && parsed.consentVersion === consentVersionFor(parsed.collectionMode) : parsed.testOnly === true) && typeof parsed.sessionId === 'string' &&
          /^[a-zA-Z0-9-]{8,100}$/.test(parsed.sessionId) &&
          validateParticipantId(parsed.participantId, parsed.collectionMode).valid &&
          typeof parsed.consentAt === 'string' && typeof parsed.consentVersion === 'string') {
        memorySession = parsed;
      }
    } catch (error) {
      storageAvailable = false;
    }
  }

  function setCollectionMode(mode) {
    if (['formal', 'pilot'].indexOf(mode) < 0) throw new Error('参加模式不正确。');
    if (activeRequest || Object.keys(pilotRequests).length) throw new Error('记录正在保存，请稍等片刻。');
    if (memorySession && memorySession.collectionMode === mode) { selectedMode = mode; return copy(memorySession); }
    if (memorySession) modeSessions[memorySession.collectionMode || 'legacy'] = memorySession;
    selectedMode = mode;
    memorySession = modeSessions[mode] || null;
    if (!memorySession) readStoredSession();
    return copy(memorySession);
  }

  function persist(key) {
    try {
      if (memorySession) {
        modeSessions[memorySession.collectionMode || 'legacy'] = memorySession;
        global.localStorage.setItem(sessionKey(memorySession.collectionMode), JSON.stringify(memorySession));
      }
      else global.localStorage.removeItem(key || sessionKey(pageMode()));
      storageAvailable = true;
    } catch (error) {
      storageAvailable = false;
    }
  }

  function getStorageStatus() {
    return {
      available: storageAvailable && pilotStorageAvailable,
      message: storageAvailable && pilotStorageAvailable ? '' : '当前浏览器无法在本机保存进度。请先不要关闭或刷新页面；你仍可下载本次记录。'
    };
  }

  function createSession(options) {
    options = options || {};
    if (activeRequest || Object.keys(pilotRequests).length) throw new Error('记录正在保存，请稍等片刻。');
    if (options.consentAccepted !== true) throw new Error('请阅读说明，并勾选同意后继续。');
    var mode = options.collectionMode || null;
    if (mode && ['formal', 'pilot'].indexOf(mode) < 0) throw new Error('参加模式不正确，请返回首页重新开始。');
    var checked = validateParticipantId(options.participantId, mode);
    if (!checked.valid) throw new Error(checked.message);
    var version = options.consentVersion || consentVersionFor(mode);
    if (mode && version !== consentVersionFor(mode)) throw new Error('请阅读当前模式的参与说明，并同意后继续。');
    if (typeof version !== 'string' || version.length > 100) throw new Error('知情同意版本不正确，请刷新页面后重试。');
    if (memorySession && memorySession.participantId === checked.value &&
        memorySession.consentVersion === version && (memorySession.collectionMode || null) === mode) return copy(memorySession);
    if (memorySession && memorySession.status !== 'confirmed' && memorySession.status !== 'ready' &&
        memorySession.status !== 'warning') {
      throw new Error('上一份记录尚未确认保存。请先核验或下载备份，再开始新的一份。');
    }
    memorySession = {
      schemaVersion: 1,
      project: PROJECT_CODE,
      sessionId: randomToken(),
      participantId: checked.value,
      consentVersion: version,
      consentAt: new Date().toISOString(),
      status: 'ready',
      testOnly: mode !== 'formal',
      attemptedAt: null,
      confirmedAt: null,
      warnings: [],
      message: '编号已保存在本机，尚未发送。'
    };
    if (mode) { memorySession.collectionMode = mode; memorySession.protocolVersion = mode === 'formal' ? 'kitchen-v1.0.0' : 'kitchen-pilot-v1.0.0'; }
    persist();
    return copy(memorySession);
  }

  function sessionStage(session) {
    return session.consentVersion === '2026-11-07.1' ? 1 : session.consentVersion === '2026-11-07.2' ? 2 : 3;
  }

  function trialFor(session) {
    return {
      schema_version: 1,
      session_id: session.sessionId,
      stage: sessionStage(session),
      test_only: true,
      consent_accepted: true,
      consent_version: session.consentVersion,
      consent_at: session.consentAt,
      record_kind: 'onboarding_connection_check'
    };
  }

  function buildPayload() {
    if (!memorySession) throw new Error('请先阅读说明并填写匿名编号。');
    if (memorySession.collectionMode) return null;
    return {
      project: PROJECT_CODE,
      experiment: 'test_onboarding',
      participant: memorySession.participantId,
      condition: 'stage' + sessionStage(memorySession),
      trials: [trialFor(memorySession)]
    };
  }

  function result(status, confirmed, message, extra) {
    return Object.assign({
      status: status,
      confirmed: confirmed,
      warnings: memorySession ? copy(memorySession.warnings || []) : [],
      message: message,
      session: copy(memorySession),
      storage: getStorageStatus()
    }, extra || {});
  }

  function setState(status, message) {
    if (memorySession) {
      memorySession.status = status;
      memorySession.message = message;
      persist();
    }
    return result(status, status === 'confirmed' || status === 'warning', message);
  }

  function addWarnings(body) {
    var warnings = [];
    ['warnings', 'warning_details'].forEach(function (key) {
      if (body && body[key]) {
        var value = body[key];
        if (Array.isArray(value)) warnings = warnings.concat(value);
        else warnings.push(value);
      }
    });
    warnings.forEach(function (warning) {
      var text = typeof warning === 'string' ? warning : JSON.stringify(warning);
      text = text.slice(0, 2000);
      if (memorySession.warnings.indexOf(text) < 0) memorySession.warnings.push(text);
    });
  }

  async function fetchJSON(url, options) {
    var controller = typeof global.AbortController === 'function' ? new global.AbortController() : null;
    var timeout;
    var request = global.fetch(url, Object.assign({
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
      signal: controller ? controller.signal : undefined
    }, options || {}));
    var deadline = new Promise(function (_, reject) {
      timeout = global.setTimeout(function () {
        if (controller) controller.abort();
        reject(new Error('request_timeout'));
      }, REQUEST_TIMEOUT);
    });
    try {
      var response = await Promise.race([request, deadline]);
      var body;
      try { body = await response.json(); }
      catch (error) { throw new Error('invalid_response'); }
      if (!response.ok || (body && body.ok === false)) {
        var failure = new Error('server_rejected');
        failure.httpStatus = response.status;
        // A definite 4xx rejection is different from an uncertain transport failure.
        failure.rejected = response.status >= 400 && response.status < 500;
        throw failure;
      }
      return body;
    } finally {
      global.clearTimeout(timeout);
    }
  }

  // The course endpoint may expose trial rows directly or inside record/trials arrays.
  // The public endpoint replaces participant IDs (e.g. test_x -> P01).
  // Match the random session ID and experiment; check the project and consent fields separately.
  function findReceipts(body, session) {
    var matches = [];
    var seen = 0;
    function visit(node, inheritedExperiment, depth) {
      if (!node || typeof node !== 'object' || depth > 9 || ++seen > 100000) return;
      if (Array.isArray(node)) {
        node.forEach(function (item) { visit(item, inheritedExperiment, depth + 1); });
        return;
      }
      var experiment = node.experiment || inheritedExperiment;
      if (node.session_id === session.sessionId &&
          experiment === 'test_onboarding') matches.push(node);
      Object.keys(node).forEach(function (key) {
        if (node[key] && typeof node[key] === 'object') visit(node[key], experiment, depth + 1);
      });
    }
    visit(body, null, 0);
    return matches;
  }

  async function checkReceipt() {
    var body = await fetchJSON(BASE_URL + '/api/hw2/data?project=' + encodeURIComponent(PROJECT_CODE));
    if (!body || typeof body !== 'object') throw new Error('invalid_response');
    if (body.project !== PROJECT_CODE) throw new Error('unexpected_project');
    var receipts = findReceipts(body, memorySession);
    if (!receipts.length) {
      function hasRecordCollection(node, depth) {
        if (Array.isArray(node)) return true;
        if (!node || typeof node !== 'object' || depth > 6) return false;
        return Object.keys(node).some(function (key) {
          return /^(data|records|trials|rows|submissions|results)$/.test(key) && Array.isArray(node[key]) ||
            (!Array.isArray(node[key]) && node[key] && typeof node[key] === 'object' && hasRecordCollection(node[key], depth + 1));
        });
      }
      // Unknown response shapes are not proof that the record is absent.
      if (!hasRecordCollection(body, 0)) throw new Error('unrecognized_data_response');
      return { found: false };
    }
    var expected = trialFor(memorySession);
    Object.keys(expected).forEach(function (key) {
      if (!receipts.some(function (row) { return String(row[key]) === String(expected[key]); })) {
        var warning = '后台核验时，字段 ' + key + ' 缺失或与发送内容不同。';
        if (memorySession.warnings.indexOf(warning) < 0) memorySession.warnings.push(warning);
      }
    });
    if (receipts.length > 1) {
      var duplicateWarning = '后台发现相同会话编号的多条记录，后续分析需要去重。';
      if (memorySession.warnings.indexOf(duplicateWarning) < 0) memorySession.warnings.push(duplicateWarning);
    }
    memorySession.confirmedAt = new Date().toISOString();
    return { found: true, count: receipts.length };
  }

  function confirmedResult() {
    return memorySession.warnings.length ?
      setState('warning', '测试记录已在老师后台查到，但有字段或重复记录需要核对。') :
      setState('confirmed', '测试记录已保存，并已在老师后台核对到。这不是正式实验数据。');
  }

  async function performVerification() {
    if (!memorySession) return result('missing', false, '请先阅读说明并填写匿名编号。');
    if (memorySession.collectionMode) return result('local', false, '同意记录已保存在本机，会随实验结果一起保存。');
    try {
      var receipt = await checkReceipt();
      if (receipt.found) return confirmedResult();
      return setState(memorySession.attemptedAt ? 'uncertain' : 'ready',
        memorySession.attemptedAt ? '暂时没有在后台查到这份记录。可以稍后重新核验，或重试保存。' : '尚未向老师后台发送这份记录。');
    } catch (error) {
      if (memorySession.confirmedAt) {
        return result(memorySession.status, true, '这份记录之前已核验成功；目前网络不通，未重新核验。');
      }
      return setState(memorySession.attemptedAt ? 'uncertain' : 'ready', '目前无法连接老师后台。记录仍保留在此页面，可稍后重试或下载备份。');
    }
  }

  async function performSubmission() {
    if (!memorySession) return result('missing', false, '请先阅读说明并填写匿名编号。');
    if (memorySession.collectionMode) return result('local', false, '同意记录已保存在本机，会随实验结果一起保存。');
    if (memorySession.confirmedAt) return confirmedResult();

    // After a timeout, the server may already have stored the record. Read before retrying.
    if (memorySession.attemptedAt) {
      try {
        var previous = await checkReceipt();
        if (previous.found) return confirmedResult();
      } catch (error) {
        return setState('uncertain', '上次保存结果还无法确认。为避免重复记录，本次没有再次发送；请稍后核验。');
      }
      if (Date.now() - Date.parse(memorySession.attemptedAt) < 5000) {
        return setState('uncertain', '刚才的记录可能还在处理，请过几秒再核验或重试。');
      }
    }

    memorySession.attemptedAt = new Date().toISOString();
    setState('pending', '正在保存测试记录，请稍等。');
    try {
      var response = await fetchJSON(BASE_URL + '/api/hw2/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload())
      });
      addWarnings(response);
      if (!response || response.ok !== true) throw new Error('unrecognized_acknowledgement');
      memorySession.acknowledgedAt = new Date().toISOString();
      persist();
      var receipt = await checkReceipt();
      if (receipt.found) return confirmedResult();
      return setState('uncertain', '服务器已接收，但暂时未查到对应记录。请稍后核验；现在不需要重新填写。');
    } catch (error) {
      return setState(error.rejected ? 'failed' : 'uncertain', error.rejected ?
        '服务器未接受这份测试记录。请下载备份，并联系项目负责人核对。' :
        '保存结果尚未确认。记录已留在此页面；请稍后核验，避免重复提交。');
    }
  }

  function withLock(action) {
    if (activeRequest) return activeRequest;
    activeRequest = Promise.resolve().then(action).finally(function () { activeRequest = null; });
    return activeRequest;
  }

  function clearSession() {
    if (activeRequest || Object.keys(pilotRequests).length) throw new Error('记录正在保存，请稍等片刻。');
    var key = sessionKey(memorySession && memorySession.collectionMode);
    delete modeSessions[memorySession && memorySession.collectionMode || 'legacy'];
    memorySession = null;
    persist(key);
  }

  function readStoredPilots() {
    [null, 'formal', 'pilot'].forEach(function (mode) {
      try {
        var raw = global.localStorage.getItem(resultsKey(mode));
        if (!raw) return;
        var stored = JSON.parse(raw);
        if (!stored || stored.schemaVersion !== 2 || !Array.isArray(stored.entries)) return;
        pilotEntries = pilotEntries.concat(stored.entries.filter(function (entry) {
          if (!entry || typeof entry.sessionId !== 'string' || !entry.session || entry.session.sessionId !== entry.sessionId ||
              !entry.result || entry.result.sessionId !== entry.sessionId || typeof entry.result.runId !== 'string' ||
              !Array.isArray(entry.result.blocks) || !entry.upload) return false;
          if (!mode) return !entry.session.collectionMode && entry.result.testOnly === true && PILOT_EXPERIMENTS.indexOf(entry.result.experiment) >= 0;
          try { validateReleaseResult(entry.result, entry.session); return entry.session.collectionMode === mode; }
          catch (_) { return false; }
        }));
      } catch (error) { if (mode === (memorySession && memorySession.collectionMode || null)) pilotStorageAvailable = false; }
    });
  }

  function persistPilots(deletedSessionId) {
    try {
      var mode = memorySession && memorySession.collectionMode || null;
      var local = pilotEntries.filter(function (entry) { return (entry.session.collectionMode || null) === mode; });
      var raw = global.localStorage.getItem(resultsKey(mode));
      var stored = raw ? JSON.parse(raw) : null;
      if (stored && stored.schemaVersion === 2 && Array.isArray(stored.entries)) stored.entries.forEach(function (remote) {
        if (!remote || !remote.session || !remote.result || !remote.upload || remote.sessionId === deletedSessionId ||
            (remote.session.collectionMode || null) !== mode) return;
        var own = local.find(function (entry) { return entry.sessionId === remote.sessionId && entry.result.runId === remote.result.runId; });
        if (!own) { local.push(remote); return; }
        // Checkpoints from a stale tab must not erase another tab's completed run
        // or upload receipt. New local states with the same attempt time win.
        if (own.result.status === 'in_progress' && remote.result.status !== 'in_progress') own.result = copy(remote.result);
        if (remote.upload.confirmedAt && (!own.upload.confirmedAt || Date.parse(remote.upload.confirmedAt) > Date.parse(own.upload.confirmedAt)) ||
            !own.upload.confirmedAt && remote.upload.attemptedAt && (!own.upload.attemptedAt || Date.parse(remote.upload.attemptedAt) > Date.parse(own.upload.attemptedAt))) {
          own.upload = copy(remote.upload);
        }
      });
      pilotEntries = pilotEntries.filter(function (entry) { return (entry.session.collectionMode || null) !== mode; }).concat(local);
      global.localStorage.setItem(resultsKey(mode), JSON.stringify({ schemaVersion: 2, entries: local }));
      pilotStorageAvailable = true;
      return true;
    } catch (error) {
      pilotStorageAvailable = false;
      return false;
    }
  }

  function currentEntries() {
    if (!memorySession) return [];
    return pilotEntries.filter(function (entry) {
      return entry.sessionId === memorySession.sessionId && (entry.session.collectionMode || null) === (memorySession.collectionMode || null);
    });
  }

  function pilotEntry(runId) {
    return currentEntries().find(function (entry) { return entry.result.runId === runId; }) || null;
  }

  function validateReleaseResult(run, participantSession) {
    var config = run && releaseConfig(run.experiment);
    if (!config || participantSession.collectionMode !== config.mode || run.collectionMode !== config.mode ||
        participantSession.testOnly !== (config.mode === 'pilot') || participantSession.protocolVersion !== config.protocol ||
        participantSession.consentVersion !== consentVersionFor(config.mode) ||
        run.testOnly !== (config.mode === 'pilot') || typeof run.simulation !== 'boolean' ||
        run.protocolVersion !== config.protocol || run.version !== config.version ||
        !run.plan || run.plan.version !== config.version || run.plan.collectionMode !== config.mode ||
        run.plan.protocolVersion !== config.protocol || run.participantId !== participantSession.participantId ||
        run.plan.participantId !== participantSession.participantId ||
        run.consentVersion && run.consentVersion !== participantSession.consentVersion) {
      throw new Error('实验模式或版本不一致，记录未发送。请保留备份后联系项目负责人。');
    }
    if (config.mode === 'formal' && (run.simulation || !validateParticipantId(participantSession.participantId, 'formal').valid ||
        [run.practice].concat(run.blocks || []).some(function (block) {
          return block && block.timing && /simulat|virtual/i.test(String(block.timing.onsetMethod || ''));
        }))) throw new Error('模拟或测试数据不能保存为正式结果。');
    if (!Array.isArray(run.blocks) || !Array.isArray(run.plan.blocks)) throw new Error('实验安排不完整，记录未发送。');
    var conditions = config.family === 'seev' ? ['baseline', 'value_cue'] : ['separated', 'integrated', 'task_matched'];
    var count = config.family === 'seev' ? 50 : 20, duration = config.family === 'seev' ? 85000 : 67000;
    if (run.plan.blocks.length !== conditions.length || run.blocks.length !== conditions.length ||
        new Set(run.plan.blocks.map(function (block) { return block.conditionId; })).size !== conditions.length ||
        new Set(run.plan.blocks.map(function (block) { return block.blockId; })).size !== conditions.length ||
        new Set(run.blocks.map(function (block) { return block.blockId; })).size !== conditions.length) {
      throw new Error('实验安排与已固定的研究方案不一致。');
    }
    run.plan.blocks.forEach(function (planned) {
      var actual = run.blocks.find(function (block) { return block.blockId === planned.blockId; });
      if (conditions.indexOf(planned.conditionId) < 0 || planned.durationMs !== duration ||
          !Array.isArray(planned.events) || planned.events.length !== count || !actual ||
          actual.conditionId !== planned.conditionId || actual.durationMs !== duration ||
          !Array.isArray(actual.events) || actual.events.length !== count ||
          new Set(planned.events.map(function (event) { return event.id; })).size !== count ||
          new Set(actual.events.map(function (event) { return event.id; })).size !== count) throw new Error('实验安排与已固定的研究方案不一致。');
      if (config.family === 'seev') {
        var mapping = run.plan.mapping;
        if (!Array.isArray(mapping) || mapping.length !== 4 || new Set(mapping.map(function (m) { return m.oven; })).size !== 4 ||
            new Set(mapping.map(function (m) { return m.frequency + ':' + m.value; })).size !== 4 || mapping.some(function (m) {
              return [0, 1, 2, 3].indexOf(m.oven) < 0 || ['high', 'low'].indexOf(m.frequency) < 0 ||
                ['high', 'low'].indexOf(m.value) < 0 || m.penalty !== (m.value === 'high' ? 5 : 1) ||
                planned.events.filter(function (e) { return e.oven === m.oven; }).length !== (m.frequency === 'high' ? 15 : 10);
            })) throw new Error('烤箱频率与损失的安排不符合当前方案。');
        if (planned.events.some(function (e) {
          var m = mapping.find(function (m) { return m.oven === e.oven; });
          return !m || e.frequency !== m.frequency || e.value !== m.value || e.penalty !== m.penalty ||
            !Number.isFinite(e.onsetMs) || e.onsetMs < 0 || e.onsetMs + e.windowMs > duration;
        })) throw new Error('烤箱试次与本轮安排不一致。');
      } else {
        ['focused', 'integrated'].forEach(function (task) {
          var subset = planned.events.filter(function (e) { return e.task === task; });
          if (subset.length !== 10 || subset.filter(function (e) { return e.expected === 'yes'; }).length !== 5) {
            throw new Error('果汁任务的题型或答案数量不符合当前方案。');
          }
        });
        if (planned.events.some(function (e, i) {
          return !Number.isInteger(e.sweet) || e.sweet < 1 || e.sweet > 10 || !Number.isInteger(e.sour) || e.sour < 1 || e.sour > 10 ||
            e.expected !== ((e.task === 'focused' ? e.sweet >= 6 : e.sweet > e.sour) ? 'yes' : 'no') ||
            e.trialIndex !== i || e.taskSwitched !== (i > 0 && planned.events[i - 1].task !== e.task);
        })) throw new Error('果汁试次与题目的正确答案不一致。');
      }
      var staticFields = config.family === 'seev' ? ['id', 'oven', 'frequency', 'value', 'penalty', 'onsetMs', 'windowMs'] :
        ['id', 'stimulusId', 'task', 'sweet', 'sour', 'expected', 'windowMs', 'itiMs', 'trialIndex', 'taskSwitched'];
      planned.events.forEach(function (plannedEvent) {
        var actualEvent = actual.events.find(function (event) { return event.id === plannedEvent.id; });
        if (!actualEvent || staticFields.some(function (field) { return actualEvent[field] !== plannedEvent[field]; })) {
          throw new Error('试次内容与本轮实验安排不一致。');
        }
        if (config.family === 'seev' && plannedEvent.windowMs !== 1800 ||
            config.family === 'pcp' && (plannedEvent.windowMs !== 3000 || plannedEvent.itiMs !== 350)) {
          throw new Error('试次时间与已固定的研究方案不一致。');
        }
      });
    });
    return config;
  }

  function savePilotResult(value) {
    if (!memorySession || memorySession.consentVersion !== consentVersionFor(memorySession.collectionMode)) {
      throw new Error('请先阅读本阶段的参与说明，并同意后继续。');
    }
    var config = value && releaseConfig(value.experiment);
    if (config) validateReleaseResult(value, memorySession);
    if (!value || value.schemaVersion !== 2 || (!config && (memorySession.collectionMode || PILOT_EXPERIMENTS.indexOf(value.experiment) < 0 || value.testOnly !== true)) ||
        typeof value.runId !== 'string' ||
        !/^[A-Za-z0-9_:.-]{8,160}$/.test(value.runId) || !Array.isArray(value.blocks) ||
        ['in_progress', 'complete', 'aborted'].indexOf(value.status) < 0) {
      throw new Error('这份实验结果格式不完整，暂时没有保存。');
    }
    if (value.sessionId && value.sessionId !== memorySession.sessionId) {
      throw new Error('这份记录属于另一位参与者，未存入当前编号。');
    }
    var existing = pilotEntries.find(function (entry) { return entry.result.runId === value.runId; });
    if (existing && existing.sessionId !== memorySession.sessionId) {
      throw new Error('这份记录属于另一位参与者，请重新开始一轮。');
    }
    if (existing && existing.result.experiment !== value.experiment) {
      throw new Error('不同实验不能共用同一轮编号，请重新开始一轮。');
    }
    if (existing && (existing.upload.attemptedAt || existing.result.status !== 'in_progress')) {
      // Completed and interrupted runs are immutable. Replaying must get a new runId.
      return { saved: pilotStorageAvailable, result: copy(existing.result), message: '这一轮的记录已保留；重新体验会另存一份。' };
    }
    var savedResult = copy(value);
    savedResult.sessionId = memorySession.sessionId;
    savedResult.participantId = memorySession.participantId;
    savedResult.consentVersion = memorySession.consentVersion;
    savedResult.consentAt = memorySession.consentAt;
    savedResult.savedAt = new Date().toISOString();
    if (existing) existing.result = savedResult;
    else {
      existing = {
        sessionId: memorySession.sessionId,
        session: copy(memorySession),
        result: savedResult,
        upload: { status: 'local', confirmed: false, attemptedAt: null, confirmedAt: null,
          warnings: [], message: '这一轮已留在本机，尚未发送。' }
      };
      pilotEntries.push(existing);
    }
    var saved = persistPilots();
    return { saved: saved, result: copy(existing.result), message: saved ?
      '这一轮已保存在本机。' : '浏览器无法保存这份结果。记录暂留在当前页面，请立即下载备份，不要刷新或关闭。' };
  }

  function getPilotResults(experiment) {
    return currentEntries().filter(function (entry) { return !experiment || entry.result.experiment === experiment; })
      .map(function (entry) { return copy(entry.result); });
  }

  function getPilotResult(experiment) {
    var entries = currentEntries().filter(function (entry) { return !experiment || entry.result.experiment === experiment; });
    return entries.length ? copy(entries[entries.length - 1].result) : null;
  }

  function clearPilotResult() {
    if (Object.keys(pilotRequests).length) throw new Error('记录正在保存，请稍等片刻。');
    if (!memorySession) return;
    pilotEntries = pilotEntries.filter(function (entry) { return entry.sessionId !== memorySession.sessionId; });
    persistPilots(memorySession.sessionId);
  }

  function getPilotUploadState(runId) {
    var entry = pilotEntry(runId);
    return entry ? Object.assign(copy(entry.upload), { runId: runId, storage: getStorageStatus() }) :
      { status: 'missing', confirmed: false, message: '当前编号下没有这轮记录。', warnings: [], runId: runId };
  }

  function nullable(value) {
    return typeof value === 'number' && Number.isFinite(value) || typeof value === 'string' || typeof value === 'boolean' ? value : null;
  }

  function bundleId(value) {
    if (value == null) return null;
    if (typeof value !== 'string' || !/^[A-Za-z0-9_:.-]{8,160}$/.test(value)) {
      throw new Error('整套测试的编号格式不正确，请保留本机备份后联系项目负责人。');
    }
    return value;
  }

  function checkStage3Plan(run, conditions, eventsPerBlock, outcomes) {
    if (!run.plan || !Array.isArray(run.plan.blocks) || run.blocks.length !== conditions.length ||
        run.plan.blocks.length !== conditions.length ||
        new Set(run.blocks.map(function (block) { return block.blockId; })).size !== conditions.length ||
        new Set(run.blocks.map(function (block) { return block.conditionId; })).size !== conditions.length) {
      throw new Error('本轮任务组不完整，请保留本机备份。');
    }
    run.blocks.forEach(function (block) {
      var planned = run.plan.blocks.find(function (item) { return item.blockId === block.blockId; });
      if (!planned || planned.conditionId !== block.conditionId || conditions.indexOf(block.conditionId) < 0 ||
          block.status !== 'complete' || !Array.isArray(block.events) || block.events.length !== eventsPerBlock ||
          !Array.isArray(planned.events) || planned.events.length !== eventsPerBlock ||
          block.events.some(function (event) {
            return outcomes.indexOf(event.outcome) < 0 || !planned.events.some(function (item) { return item.id === event.id; });
          }) || new Set(block.events.map(function (event) { return event.id; })).size !== eventsPerBlock) {
        throw new Error('本轮有未完成或缺少的试次，请保留本机备份。');
      }
    });
  }

  function pcpPayload(entry) {
    var run = entry.result;
    if (run.status !== 'complete' || run.completed !== true || run.aborted === true) {
      throw new Error('这一轮尚未完整结束，只保留本机备份，不上传为完整测试。');
    }
    checkStage3Plan(run, ['separated', 'integrated', 'task_matched'], 20, ['correct', 'incorrect', 'timeout']);
    var trials = [], ids = new Set();
    run.blocks.forEach(function (block) {
      ['focused', 'integrated'].forEach(function (task) {
        if (block.events.filter(function (event) { return event.task === task; }).length !== 10) {
          throw new Error('本轮两类判断题的试次不完整，请保留本机备份。');
        }
      });
      block.events.forEach(function (event) {
        if (typeof event.trialId !== 'string' || !event.trialId || ids.has(event.trialId)) {
          throw new Error('试次编号重复或缺失，请保留备份后联系项目负责人。');
        }
        ids.add(event.trialId);
        var trial = {
          schema_version: 2, session_id: entry.sessionId, stage: 3, test_only: true,
          consent_accepted: true, consent_version: entry.session.consentVersion, consent_at: entry.session.consentAt,
          run_id: run.runId, trial_id: event.trialId, record_kind: 'event',
          bundle_id: bundleId(run.bundleId),
          experiment_version: nullable(run.plan.version || run.version), simulation: run.simulation === true,
          block_id: block.blockId, block_index: nullable(block.index), cond: block.conditionId,
          block_duration_ms: nullable(block.durationMs),
          stimulus_id: nullable(event.stimulusId), task: event.task, sweet: nullable(event.sweet), sour: nullable(event.sour),
          expected: nullable(event.expected), response: nullable(event.response), response_key: nullable(event.responseKey),
          trial_index: nullable(event.trialIndex), task_switched: event.taskSwitched === true,
          window_ms: nullable(event.windowMs), iti_ms: nullable(event.itiMs),
          actual_onset_ms: nullable(event.actualOnsetMs), actual_onset_perf_ms: nullable(event.actualOnsetPerfMs),
          response_ms: nullable(event.responseMs), response_perf_ms: nullable(event.responsePerfMs), rt_ms: nullable(event.rtMs),
          outcome: event.outcome, correct: event.outcome === 'correct', closed_at_ms: nullable(event.closedAtMs),
          plan_seed: nullable(run.plan.seed), order_index: nullable(run.plan.orderIndex),
          max_frame_gap_ms: nullable(block.timing && block.timing.maxFrameGapMs)
        };
        if (Object.keys(trial).length > 40) throw new Error('记录字段过多，暂未上传；请下载备份。');
        trials.push(trial);
      });
    });
    return { project: PROJECT_CODE, experiment: 'test_pcp_juice_stage3', participant: entry.session.participantId,
      condition: 'stage3', trials: trials };
  }

  function releasePayload(entry) {
    var config = validateReleaseResult(entry.result, entry.session);
    // Completed release records need actual presentation times. Missing RT is
    // permitted only for missed/timeout events, never silently substituted.
    if (entry.result.status === 'complete') entry.result.blocks.forEach(function (block) {
      block.events.forEach(function (event) {
        var responded = ['hit', 'correct', 'incorrect'].indexOf(event.outcome) >= 0;
        if (!Number.isFinite(event.actualOnsetMs) || event.actualOnsetMs < 0 ||
            !Number.isFinite(event.actualOnsetPerfMs) || event.actualOnsetPerfMs < 0 ||
            responded && (!Number.isFinite(event.rtMs) || event.rtMs < 0 || event.rtMs >= event.windowMs ||
              !Number.isFinite(event.responseMs) || !Number.isFinite(event.responsePerfMs) ||
              Math.abs(event.responseMs - event.actualOnsetMs - event.rtMs) > 1 ||
              Math.abs(event.responsePerfMs - event.actualOnsetPerfMs - event.rtMs) > 1) ||
            !responded && event.rtMs != null) throw new Error('本轮的呈现时间或反应时记录不完整，请保留本机备份。');
        if (config.family === 'pcp' && (responded ?
            ['yes', 'no'].indexOf(event.response) < 0 || event.responseKey !== (event.response === 'yes' ? 'f' : 'j') ||
              (event.outcome === 'correct') !== (event.response === event.expected) :
            event.response != null || event.responseKey != null)) throw new Error('本轮按键与回答记录不一致，请保留本机备份。');
      });
    });
    var legacy = Object.assign({}, entry, { result: Object.assign({}, entry.result, {
      experiment: config.family === 'seev' ? 'seev_bakery_stage3' : 'pcp_juice_stage3'
    }) });
    var payload = pilotPayload(legacy);
    payload.experiment = entry.result.experiment;
    payload.condition = config.mode;
    payload.trials.forEach(function (trial) {
      // Replace two obsolete stage fields, retaining the 40-field course limit.
      delete trial.stage; delete trial.block_duration_ms;
      trial.collection_mode = config.mode;
      trial.protocol_version = config.protocol;
      trial.test_only = config.mode === 'pilot';
      trial.simulation = false;
      if (Object.keys(trial).length > 40) throw new Error('记录字段过多，暂未上传；请下载备份。');
    });
    return payload;
  }

  function pilotPayload(entry) {
    var run = entry.result;
    if (releaseConfig(run.experiment)) return releasePayload(entry);
    if (run.experiment === 'pcp_juice_stage3') return pcpPayload(entry);
    var stage = run.experiment === 'seev_bakery_stage2' ? 2 : 3;
    if (run.status !== 'complete' || run.completed !== true || run.aborted === true || !run.blocks.length ||
        run.blocks.some(function (block) {
          return block.status !== 'complete' || !Array.isArray(block.events) || !block.events.length ||
            block.events.some(function (event) { return ['hit', 'miss'].indexOf(event.outcome) < 0; });
        })) throw new Error('这一轮尚未完整结束，只保留本机备份，不上传为完整测试。');
    if (stage === 3) checkStage3Plan(run, ['baseline', 'value_cue'], 50, ['hit', 'miss']);
    var trials = [];
    var ids = new Set();
    function row(block, kind, id, fields) {
      if (typeof id !== 'string' || !id || ids.has(id)) throw new Error('试次编号重复或缺失，请保留备份后联系项目负责人。');
      ids.add(id);
      var item = Object.assign({
        schema_version: 2, session_id: entry.sessionId, stage: stage, test_only: true,
        consent_accepted: true, consent_version: entry.session.consentVersion, consent_at: entry.session.consentAt,
        run_id: run.runId, trial_id: id, record_kind: kind,
        experiment_version: nullable(run.plan && run.plan.version || run.version), simulation: run.simulation === true,
        block_id: block.blockId, block_index: nullable(block.index), cond: block.conditionId,
        block_duration_ms: nullable(block.durationMs)
      }, fields);
      if (Object.keys(item).length > 40) throw new Error('记录字段过多，暂未上传；请下载备份。');
      trials.push(item);
    }
    run.blocks.forEach(function (block) {
      block.events.forEach(function (event) {
        row(block, 'event', event.trialId, Object.assign({
          oven: nullable(event.oven), frequency: nullable(event.frequency), value: nullable(event.value),
          penalty: nullable(event.penalty), onset_ms: nullable(event.onsetMs), window_ms: nullable(event.windowMs),
          actual_onset_ms: nullable(event.actualOnsetMs), actual_onset_perf_ms: nullable(event.actualOnsetPerfMs),
          response_ms: nullable(event.responseMs), response_perf_ms: nullable(event.responsePerfMs), rt_ms: nullable(event.rtMs),
          plan_seed: nullable(run.plan && run.plan.seed), order_index: nullable(run.plan && run.plan.orderIndex),
          outcome: event.outcome, closed: event.closed === true, delay_ms: nullable(event.delayMs)
        }, stage === 3 ? { bundle_id: bundleId(run.bundleId) } : {}));
      });
      (block.falseAlarms || []).forEach(function (alarm) {
        row(block, 'false_alarm', alarm.trialId, {
          oven: nullable(alarm.oven), response_ms: nullable(alarm.atMs), response_perf_ms: nullable(alarm.atPerfMs),
          response_kind: nullable(alarm.kind), target_trial_id: nullable(alarm.targetTrialId),
          active_trial_ids: Array.isArray(alarm.activeTrialIds) ? alarm.activeTrialIds.join('|') : ''
        });
      });
      var quality = block.quality || {};
      var qualityFields = {
        behavior_event_count: block.events.length, false_alarm_count: (block.falseAlarms || []).length,
        gaze_validated: quality.gazeValidated === true, expected_bins: nullable(quality.expectedBins),
        sampled_bins: nullable(quality.sampledBins), valid_bins: nullable(quality.validBins),
        in_oven_bins: nullable(quality.inOvenBins), sample_coverage: nullable(quality.sampleCoverage),
        in_oven_share_of_valid: nullable(quality.inOvenShareOfValid),
        usable_for_inference: quality.usableForInference === true && quality.gazeValidated === true,
        task_min_coverage: nullable(quality.taskCoverageRule && quality.taskCoverageRule.minimumCoverage),
        block_elapsed_ms: nullable(block.elapsedMs)
      };
      for (var oven = 0; oven < 4; oven++) {
        var ovenSummary = (quality.ovens || []).find(function (item) { return item.oven === oven; }) || {};
        qualityFields['oven_' + oven + '_samples'] = nullable(ovenSummary.samples);
        qualityFields['oven_' + oven + '_share_valid'] = nullable(ovenSummary.shareOfValid);
        qualityFields['oven_' + oven + '_share_in_oven'] = nullable(ovenSummary.shareOfInOven);
      }
      // 40 flat fields. Raw coordinates and camera frames are deliberately excluded.
      row(block, 'block_quality', run.runId + ':' + block.blockId + ':quality', qualityFields);
    });
    var report = run.gazeValidation || run.gazeReport || run.qualityResult;
    if (report && report.validation && Array.isArray(report.validation.rows)) {
      report.validation.rows.forEach(function (validation, index) {
        row({ blockId: 'validation', conditionId: 'device_check', index: null,
          durationMs: report.validation.targetDurationMs }, 'gaze_validation', run.runId + ':validation:' + index, {
          target: nullable(validation.target), callbacks: nullable(validation.callbacks),
          valid_samples: nullable(validation.validSamples), correct_samples: nullable(validation.correctSamples),
          area_accuracy: nullable(validation.areaAccuracy), coverage: nullable(validation.coverage),
          valid_sample_rate: nullable(validation.validSampleRate), coverage_bin_ms: nullable(validation.coverageBinMs),
          mouse_training: report.validation.mouseTraining === true,
          settling_excluded_ms: nullable(report.validation.settlingExcludedMs),
          calibration_points: nullable(report.calibration && report.calibration.points),
          clicks_per_point: nullable(report.calibration && report.calibration.clicksPerPoint),
          validation_version: nullable(report.version), webgazer_version: nullable(report.webgazerVersion),
          validation_passed: Boolean(report.quality && report.quality.passed === true),
          threshold_basis: nullable(report.quality && report.quality.basis),
          min_area_accuracy: nullable(report.quality && report.quality.minAreaAccuracy),
          min_coverage: nullable(report.quality && report.quality.minCoverage),
          scientific_pass_threshold: null, validation_outcome: nullable(report.outcome)
        });
      });
    }
    return { project: PROJECT_CODE, experiment: 'test_' + run.experiment, participant: entry.session.participantId,
      condition: 'stage' + stage, trials: trials };
  }

  function pilotState(entry, status, message, warnings) {
    entry.upload.status = status;
    entry.upload.confirmed = status === 'confirmed' || status === 'warning';
    entry.upload.message = message;
    if (warnings) entry.upload.warnings = warnings;
    persistPilots();
    return getPilotUploadState(entry.result.runId);
  }

  function receiptRows(body, expectedExperiment) {
    var rows = [], collectionSeen = false, visited = 0;
    function visit(node, experiment, depth) {
      if (!node || typeof node !== 'object' || depth > 12 || ++visited > 150000) return;
      if (Array.isArray(node)) {
        node.forEach(function (item) { visit(item, experiment, depth + 1); });
        return;
      }
      experiment = node.experiment || experiment;
      if (node.trial_id && node.run_id) rows.push(Object.assign({ _receipt_experiment: experiment }, node));
      Object.keys(node).forEach(function (key) {
        if (/^(data|records|trials|rows|submissions|results)$/.test(key) && Array.isArray(node[key])) collectionSeen = true;
        if (node[key] && typeof node[key] === 'object') visit(node[key], experiment, depth + 1);
      });
    }
    visit(body, null, 0);
    if (!collectionSeen) throw new Error('unrecognized_data_response');
    return rows;
  }

  async function verifyPilot(entry, payload) {
    var body = await fetchJSON(BASE_URL + '/api/hw2/data?project=' + encodeURIComponent(PROJECT_CODE));
    if (!body || body.project !== PROJECT_CODE) throw new Error('unexpected_project');
    var expectedIds = new Set(payload.trials.map(function (trial) { return trial.trial_id; }));
    var rows = receiptRows(body, payload.experiment).filter(function (item) {
      return item.run_id === entry.result.runId || expectedIds.has(item.trial_id);
    });
    if (!rows.length) return { found: false, matched: false, warnings: [] };
    if (rows.some(function (item) {
      return item.run_id !== entry.result.runId || item.session_id !== entry.sessionId || item._receipt_experiment !== payload.experiment;
    })) return { found: true, matched: false, warnings: ['后台已有相同轮次或试次编号，但实验名称、会话或轮次字段不一致；本次不会重复发送。'] };
    var warnings = [];
    payload.trials.forEach(function (expected) {
      var candidates = rows.filter(function (item) { return item.trial_id === expected.trial_id; });
      if (!candidates.length) { warnings.push('后台缺少试次：' + expected.trial_id); return; }
      if (candidates.length > 1) warnings.push('后台有重复试次：' + expected.trial_id);
      candidates.forEach(function (actual) {
        Object.keys(expected).forEach(function (key) {
          if (!Object.prototype.hasOwnProperty.call(actual, key) || actual[key] !== expected[key]) {
            warnings.push('试次 ' + expected.trial_id + ' 的 ' + key + ' 字段缺失或不一致。');
          }
        });
      });
    });
    if (rows.some(function (item) { return !expectedIds.has(item.trial_id); })) warnings.push('后台出现本轮未发送的额外试次。');
    var mismatch = warnings.some(function (warning) { return warning.indexOf('后台有重复试次：') !== 0; });
    return { found: true, matched: !mismatch, warnings: warnings };
  }

  function finishPilotVerification(entry, receipt) {
    if (!receipt.matched) return pilotState(entry, 'mismatch', '后台记录不完整或字段不一致，暂未确认保存成功。请下载备份后联系项目负责人。', receipt.warnings);
    entry.upload.confirmedAt = new Date().toISOString();
    var warnings = (entry.upload.warnings || []).concat(receipt.warnings);
    return pilotState(entry, warnings.length ? 'warning' : 'confirmed', warnings.length ?
      '本轮全部记录已核验，后台仍有提示需要核对。请保留备份。' :
      entry.session.collectionMode === 'formal' ? '本轮实验结果已逐条核验保存。谢谢你的参加。' :
      '本轮测试记录已逐条核验保存。这是试运行数据，不计入正式实验。', warnings);
  }

  async function performPilotSubmission(entry) {
    if (entry.result.simulation === true || [entry.result.practice].concat(entry.result.blocks || []).some(function (block) {
      return block && block.timing && /simulat|virtual/i.test(String(block.timing.onsetMethod || ''));
    })) return pilotState(entry, 'local_only', '这是模拟记录，只保留本机，不会发送到课程后台。');
    var payload;
    try { payload = pilotPayload(entry); }
    catch (error) { return pilotState(entry, 'incomplete', error.message); }
    if (entry.upload.confirmedAt) return getPilotUploadState(entry.result.runId);
    if (entry.upload.attemptedAt) {
      try {
        var previous = await verifyPilot(entry, payload);
        if (previous.found) return finishPilotVerification(entry, previous);
      } catch (error) {
        return pilotState(entry, 'uncertain', '上次保存结果还无法确认。为避免重复记录，本次没有再次发送，请稍后重试核验。');
      }
      if (Date.now() - Date.parse(entry.upload.attemptedAt) < 5000) {
        return pilotState(entry, 'uncertain', '后台可能仍在处理，请稍后重试核验。');
      }
    }
    entry.upload.attemptedAt = new Date().toISOString();
    pilotState(entry, 'pending', '正在保存本轮记录，请稍等。');
    try {
      var response = await fetchJSON(BASE_URL + '/api/hw2/submit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      });
      ['warnings', 'warning_details'].forEach(function (key) {
        if (response && response[key]) {
          var list = Array.isArray(response[key]) ? response[key] : [response[key]];
          list.forEach(function (warning) {
            var text = typeof warning === 'string' ? warning : JSON.stringify(warning);
            if (entry.upload.warnings.indexOf(text) < 0) entry.upload.warnings.push(text);
          });
        }
      });
      if (!response || response.ok !== true) throw new Error('unrecognized_acknowledgement');
      entry.upload.acknowledgedAt = new Date().toISOString();
      persistPilots();
      var receipt = await verifyPilot(entry, payload);
      if (receipt.found) return finishPilotVerification(entry, receipt);
      return pilotState(entry, 'uncertain', '后台已接收请求，但还没有查到完整记录。请稍后核验，或下载备份。');
    } catch (error) {
      return pilotState(entry, error.rejected ? 'failed' : 'uncertain', error.rejected ?
        '后台未接受这份记录。请下载备份，并联系项目负责人核对。' :
        '保存结果尚未确认。请保留页面或下载备份，稍后先核验再重试。');
    }
  }

  function refreshUploadFromStorage(entry) {
    try {
      var stored = JSON.parse(global.localStorage.getItem(resultsKey(entry.session.collectionMode)) || 'null');
      var current = stored && Array.isArray(stored.entries) && stored.entries.find(function (other) {
        return other.sessionId === entry.sessionId && other.result && other.result.runId === entry.result.runId &&
          other.result.experiment === entry.result.experiment && other.upload;
      });
      // A second tab may have finished while this tab waited for the browser lock.
      // Never replace a known attempt with an older, unattempted snapshot.
      if (current && (current.upload.confirmedAt || current.upload.attemptedAt &&
          (!entry.upload.attemptedAt || Date.parse(current.upload.attemptedAt) >= Date.parse(entry.upload.attemptedAt)))) {
        entry.upload = copy(current.upload);
      }
    } catch (_) { /* Unavailable storage keeps the in-page copy and its honest warning. */ }
  }

  function submitPilotResult(runId) {
    var entry = pilotEntry(runId);
    if (!entry) return Promise.resolve(getPilotUploadState(runId));
    if (pilotRequests[runId]) return pilotRequests[runId];
    pilotRequests[runId] = Promise.resolve().then(function () {
      var locks = global.navigator && global.navigator.locks;
      if (locks && typeof locks.request === 'function') {
        return locks.request('attention-kitchen:' + PROJECT_CODE + ':' + (entry.session.collectionMode || 'legacy') + ':' + runId, function () {
          refreshUploadFromStorage(entry);
          return performPilotSubmission(entry);
        });
      }
      refreshUploadFromStorage(entry);
      return performPilotSubmission(entry);
    }).finally(function () { delete pilotRequests[runId]; });
    return pilotRequests[runId];
  }

  function recoverPendingResults() {
    if (!memorySession || memorySession.collectionMode !== 'formal') return Promise.resolve([]);
    return Promise.all(currentEntries().filter(function (entry) {
      return releaseConfig(entry.result.experiment) && entry.result.status === 'complete' && !entry.upload.confirmedAt;
    }).map(function (entry) { return submitPilotResult(entry.result.runId); }));
  }

  readStoredSession();
  readStoredPilots();
  global.AttentionData = Object.freeze({
    PROJECT_CODE: PROJECT_CODE,
    CONSENT_VERSION: CONSENT_VERSION,
    FORMAL_CONSENT_VERSION: FORMAL_CONSENT_VERSION,
    PILOT_CONSENT_VERSION: PILOT_CONSENT_VERSION,
    getConsentVersion: consentVersionFor,
    setCollectionMode: setCollectionMode,
    generateParticipantId: generateParticipantId,
    validateParticipantId: validateParticipantId,
    createSession: createSession,
    getSession: function () { return copy(memorySession); },
    getStorageStatus: getStorageStatus,
    submitOnboarding: function () { return withLock(performSubmission); },
    verifyReceipt: function () { return withLock(performVerification); },
    getBackup: function () {
      var all = getPilotResults();
      var seev = all.filter(function (item) { return /^(?:test_)?seev_/.test(item.experiment); });
      return { exportedAt: new Date().toISOString(), testOnly: memorySession ? memorySession.testOnly : true, session: copy(memorySession),
        payload: memorySession ? buildPayload() : null, pilotResults: all,
        seevPilot: seev.length ? seev[seev.length - 1] : null, seevPilots: seev,
        pcpPilots: all.filter(function (item) { return /^(?:test_)?pcp_/.test(item.experiment); }),
        pilotUploads: currentEntries().map(function (entry) { return { runId: entry.result.runId, upload: copy(entry.upload) }; }) };
    },
    savePilotResult: savePilotResult,
    saveResult: savePilotResult,
    getPilotResult: getPilotResult,
    getPilotResults: getPilotResults,
    getResults: getPilotResults,
    clearPilotResult: clearPilotResult,
    submitPilotResult: submitPilotResult,
    submitResult: submitPilotResult,
    getPilotUploadState: getPilotUploadState,
    getUploadState: getPilotUploadState,
    recoverPendingResults: recoverPendingResults,
    getLegacyBackup: function () {
      var legacySession = modeSessions.legacy || (memorySession && !memorySession.collectionMode ? memorySession : null);
      if (!legacySession) { try { legacySession = JSON.parse(global.localStorage.getItem(STORAGE_KEY) || 'null'); } catch (_) {} }
      return { session: copy(legacySession), exportedAt: new Date().toISOString(), legacy: true, testOnly: true,
        records: copy(pilotEntries.filter(function (entry) { return !entry.session.collectionMode; })) };
    },
    clearSession: clearSession
  });
})(window);
