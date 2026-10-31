// 酷乐光年 token 自动同步到青龙面板
// Quantumult X 重写脚本（script-request-header）
// 设计要点：
//   1. 面板 bearer 缓存在 $prefs（有效期约 20 天），跳过约 3 秒的慢速登录
//   2. 请求最多阻塞 10 秒，超时无条件放行，绝不影响小程序
//   3. 同一 token 只同步一次，失败提醒 10 分钟限频且附具体错误

var panelUrl = 'http://192.168.6.114:5700';
var panelUser = 'bmfy';
var panelPass = 'Dangopi314';

var finished = false;
var settled = false;
function finish() {
  if (finished) return;
  finished = true;
  $done();
}
setTimeout(function () {
  if (!settled) console.log('10 秒兜底触发，强制放行请求');
  finish();
}, 10000);

function prefsGet(key, def) {
  try {
    if (typeof $prefs !== 'undefined' && $prefs && typeof $prefs.valueForKey === 'function') {
      var v = $prefs.valueForKey(key);
      if (v !== undefined && v !== null && v !== '') return v;
    }
  } catch (e) {}
  return def;
}

function prefsSet(key, value) {
  try {
    if (typeof $prefs !== 'undefined' && $prefs && typeof $prefs.setValueForKey === 'function') {
      $prefs.setValueForKey(value, key);
    }
  } catch (e) {}
}

var headers = $request.headers || {};
var authHeader = headers['Authorization'] || headers['authorization'] || '';

if (authHeader.indexOf('Token ') !== 0) {
  settled = true;
  finish();
} else if (authHeader === prefsGet('kule_last_synced', '')) {
  // 该 token 已同步过，直接放行
  settled = true;
  finish();
} else {
  var now = Date.now();
  var lastTry = parseInt(prefsGet('kule_last_try', '0'), 10) || 0;
  if (now - lastTry < 20000) {
    // 20 秒内刚尝试过，跳过本次
    settled = true;
    finish();
  } else {
    prefsSet('kule_last_try', String(now));
    sync(authHeader);
  }
}

function login() {
  return $task.fetch({
    url: panelUrl + '/api/user/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: panelUser, password: panelPass })
  }).then(function (resp) {
    var d = JSON.parse(resp.body);
    if (d.code !== 200) {
      console.log('面板登录失败: ' + JSON.stringify(d));
      throw new Error('登录失败: ' + (d.message || d.code));
    }
    prefsSet('kule_panel_bearer', d.data.token);
    console.log('面板登录成功');
    return d.data.token;
  });
}

function getEnvs(bearer) {
  return $task.fetch({
    url: panelUrl + '/api/envs?searchValue=KULE_SIGN_HEADERS',
    method: 'GET',
    headers: { Authorization: 'Bearer ' + bearer }
  });
}

function putEnv(bearer, existing, newValue) {
  var opts = {
    url: panelUrl + '/api/envs',
    headers: {
      Authorization: 'Bearer ' + bearer,
      'Content-Type': 'application/json'
    }
  };
  if (existing) {
    opts.method = 'PUT';
    opts.body = JSON.stringify({ id: existing.id, name: 'KULE_SIGN_HEADERS', value: newValue });
  } else {
    opts.method = 'POST';
    opts.body = JSON.stringify([{ name: 'KULE_SIGN_HEADERS', value: newValue }]);
  }
  return $task.fetch(opts);
}

function sync(token) {
  console.log('同步 token: ' + token.slice(0, 24) + '...');

  var cached = prefsGet('kule_panel_bearer', '');
  var envStep;
  if (cached) {
    envStep = getEnvs(cached).then(function (resp) {
      if (resp.statusCode === 401) {
        console.log('bearer 失效，重新登录');
        return login().then(function (bearer) {
          return getEnvs(bearer);
        });
      }
      return resp;
    });
  } else {
    envStep = login().then(function (bearer) {
      return getEnvs(bearer);
    });
  }

  envStep.then(function (envResponse) {
    if (envResponse.statusCode !== 200) {
      throw new Error('查询环境变量失败 HTTP ' + envResponse.statusCode);
    }
    var envsData = JSON.parse(envResponse.body);
    var list = envsData.data || [];
    var existing = null;
    for (var i = 0; i < list.length; i++) {
      if (list[i].name === 'KULE_SIGN_HEADERS') {
        existing = list[i];
        break;
      }
    }

    // 保留原有 headers（如 User-Agent），只更新 Authorization
    var headersObj = { Authorization: token };
    if (existing) {
      try {
        var old = JSON.parse(existing.value);
        if (old && typeof old === 'object') {
          old.Authorization = token;
          headersObj = old;
        }
      } catch (e) {
        // 旧值不是合法 JSON，直接用新对象
      }
    }
    var newValue = JSON.stringify(headersObj);

    var bearer = prefsGet('kule_panel_bearer', '');
    return putEnv(bearer, existing, newValue);
  }).then(function (updateResponse) {
    settled = true;
    var updateData = JSON.parse(updateResponse.body);
    if (updateData.code === 200) {
      prefsSet('kule_last_synced', token);
      console.log('token 同步成功');
      $notify('酷乐光年', 'token 已自动同步', '签到将使用最新 token');
    } else {
      console.log('token 同步失败: ' + JSON.stringify(updateData));
      failNotify(updateData.message || '更新失败');
    }
    finish();
  }, function (reason) {
    settled = true;
    var err = '未知错误';
    if (reason && reason.error) {
      err = String(reason.error);
    } else if (reason && reason.message) {
      err = String(reason.message);
    }
    console.log('请求异常: ' + err);
    failNotify(err);
    finish();
  });
}

function failNotify(message) {
  var now = Date.now();
  var lastFail = parseInt(prefsGet('kule_last_fail', '0'), 10) || 0;
  if (now - lastFail > 600000) {
    prefsSet('kule_last_fail', String(now));
    $notify('酷乐光年', 'token 同步失败', message);
  }
}
