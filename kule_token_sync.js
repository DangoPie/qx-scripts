// 酷乐光年 token 自动同步到青龙面板
// Quantumult X 重写脚本（script-request-header）
//
// 所有配置均通过重写规则 URL 的 hash 参数传入（QX 的"环境变量"机制，
// 通过 $environment.variables 读取），脚本内不写死任何 IP / 账号 / 密码。
// 参数：
//   panelUrls  多个面板地址，用 | 分隔，按顺序尝试；最近成功的地址会缓存并优先使用
//   panelUser  面板用户名
//   panelPass  面板密码
//
// 规则示例（把 <commit> 换成实际提交哈希）：
// ^https://pw\.gzych\.vip/.* url script-request-header https://raw.githubusercontent.com/DangoPie/qx-scripts/main/kule_token_sync.js#panelUrls=http://你的面板IP:5700&panelUser=你的用户名&panelPass=你的密码
//
// 设计要点：
//   1. 面板 bearer 缓存在 $prefs（有效期约 20 天），跳过约 3 秒的慢速登录
//   2. 请求最多阻塞 10 秒，超时无条件放行，绝不影响小程序
//   3. 同一 token 只同步一次，失败提醒 10 分钟限频且附具体错误
//   4. 多面板地址依次容错，最近可用的地址缓存后优先使用

var envVars = {};
try {
  if (typeof $environment !== 'undefined' && $environment && $environment.variables) {
    envVars = $environment.variables;
  }
} catch (e) {}

var panelUrls = [];
var rawUrls = envVars.panelUrls || '';
var urlParts = rawUrls.split('|');
for (var i = 0; i < urlParts.length; i++) {
  var u = urlParts[i].trim();
  if (u) panelUrls.push(u);
}
var panelUser = envVars.panelUser || '';
var panelPass = envVars.panelPass || '';

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

function failNotify(message) {
  var now = Date.now();
  var lastFail = parseInt(prefsGet('kule_last_fail', '0'), 10) || 0;
  if (now - lastFail > 600000) {
    prefsSet('kule_last_fail', String(now));
    $notify('酷乐光年', 'token 同步失败', message);
  }
}

// 最近一次成功的面板地址，优先复用
var activeUrl = prefsGet('kule_panel_url', '');

function orderedUrls() {
  var list = [];
  if (activeUrl) list.push(activeUrl);
  for (var j = 0; j < panelUrls.length; j++) {
    if (panelUrls[j] !== activeUrl) list.push(panelUrls[j]);
  }
  return list;
}

// 依次尝试每个面板地址执行 action(url)；成功则缓存该地址
function withPanel(action) {
  var urls = orderedUrls();
  function attempt(k) {
    if (k >= urls.length) {
      return Promise.reject(new Error('所有面板地址均无法连接'));
    }
    var url = urls[k];
    return action(url).then(function (result) {
      if (url !== activeUrl) {
        activeUrl = url;
        prefsSet('kule_panel_url', url);
      }
      return result;
    }, function (reason) {
      var err = '未知错误';
      if (reason && reason.error) err = String(reason.error);
      else if (reason && reason.message) err = String(reason.message);
      else err = String(reason);
      console.log('面板 ' + url + ' 连接失败(' + err + ')，尝试下一个地址');
      return attempt(k + 1);
    });
  }
  return attempt(0);
}

if (panelUrls.length === 0 || !panelUser || !panelPass) {
  settled = true;
  failNotify('未配置面板参数：请在重写规则 URL 后加 #panelUrls=地址1|地址2&panelUser=账号&panelPass=密码');
  finish();
} else {
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
}

function login(url) {
  return $task.fetch({
    url: url + '/api/user/login',
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

function getEnvs(url, bearer) {
  return $task.fetch({
    url: url + '/api/envs?searchValue=KULE_SIGN_HEADERS',
    method: 'GET',
    headers: { Authorization: 'Bearer ' + bearer }
  });
}

function putEnv(url, bearer, existing, newValue) {
  var opts = {
    url: url + '/api/envs',
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
    envStep = withPanel(function (url) {
      return getEnvs(url, cached);
    }).then(function (resp) {
      if (resp.statusCode === 401) {
        console.log('bearer 失效，重新登录');
        return withPanel(function (url) {
          return login(url);
        }).then(function (bearer) {
          return withPanel(function (url) {
            return getEnvs(url, bearer);
          });
        });
      }
      return resp;
    });
  } else {
    envStep = withPanel(function (url) {
      return login(url);
    }).then(function (bearer) {
      return withPanel(function (url) {
        return getEnvs(url, bearer);
      });
    });
  }

  envStep.then(function (envResponse) {
    if (envResponse.statusCode !== 200) {
      throw new Error('查询环境变量失败 HTTP ' + envResponse.statusCode);
    }
    var envsData = JSON.parse(envResponse.body);
    var list = envsData.data || [];
    var existing = null;
    for (var m = 0; m < list.length; m++) {
      if (list[m].name === 'KULE_SIGN_HEADERS') {
        existing = list[m];
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
    return withPanel(function (url) {
      return putEnv(url, bearer, existing, newValue);
    });
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
