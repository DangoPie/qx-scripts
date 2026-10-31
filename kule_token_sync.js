// 酷乐光年 token 自动同步到青龙面板
// Quantumult X 重写脚本（script-request-header）
// 设计要点：
//   1. 请求最多阻塞 3 秒，超时无条件放行，绝不影响小程序
//   2. 同一 token 只同步一次（$prefs 记录），不重复刷面板
//   3. 失败提醒 10 分钟内最多一次，且附具体错误原因

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
  if (!settled) console.log('6 秒兜底触发，强制放行请求');
  finish();
}, 6000);

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
  finish();
} else if (authHeader === prefsGet('kule_last_synced', '')) {
  // 该 token 已同步过，直接放行
  finish();
} else {
  var now = Date.now();
  var lastTry = parseInt(prefsGet('kule_last_try', '0'), 10) || 0;
  if (now - lastTry < 20000) {
    // 20 秒内刚尝试过，跳过本次
    finish();
  } else {
    prefsSet('kule_last_try', String(now));
    sync(authHeader);
  }
}

function sync(token) {
  console.log('同步 token: ' + token.slice(0, 24) + '...');

  // 1. 登录青龙面板
  $task.fetch({
    url: panelUrl + '/api/user/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: panelUser, password: panelPass })
  }).then(function (loginResponse) {
    var loginData = JSON.parse(loginResponse.body);
    if (loginData.code !== 200) {
      console.log('面板登录失败: ' + JSON.stringify(loginData));
      failNotify('面板登录失败');
      finish();
      return;
    }
    var panelToken = loginData.data.token;
    console.log('面板登录成功');

    // 2. 查询现有环境变量
    return $task.fetch({
      url: panelUrl + '/api/envs?searchValue=KULE_SIGN_HEADERS',
      method: 'GET',
      headers: { Authorization: 'Bearer ' + panelToken }
    }).then(function (envResponse) {
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

      if (existing) {
        return $task.fetch({
          url: panelUrl + '/api/envs',
          method: 'PUT',
          headers: {
            Authorization: 'Bearer ' + panelToken,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            id: existing.id,
            name: 'KULE_SIGN_HEADERS',
            value: newValue
          })
        });
      }
      return $task.fetch({
        url: panelUrl + '/api/envs',
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + panelToken,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify([{ name: 'KULE_SIGN_HEADERS', value: newValue }])
      });
    });
  }).then(function (updateResponse) {
    if (!updateResponse) return;
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
    var err = (reason && reason.error) ? String(reason.error) : '未知错误';
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
