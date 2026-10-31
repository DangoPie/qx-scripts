// 酷乐光年 token 自动同步到青龙面板
// Quantumult X 重写脚本（script-request-header）
// API：$task.fetch / $notify / $done

var panelUrl = 'http://192.168.6.114:5700';
var panelUser = 'bmfy';
var panelPass = 'Dangopi314';

var headers = $request.headers || {};
var authHeader = headers['Authorization'] || headers['authorization'] || '';

if (authHeader.indexOf('Token ') !== 0) {
  console.log('未找到 Authorization 头，跳过');
  $done();
} else {
  sync(authHeader);
}

function sync(token) {
  console.log('捕获到 token: ' + token.slice(0, 30) + '...');

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
      $notify('酷乐光年', 'token 同步失败', '面板登录失败');
      $done();
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
    if (!updateResponse) {
      return;
    }
    var updateData = JSON.parse(updateResponse.body);
    if (updateData.code === 200) {
      console.log('token 同步成功');
      $notify('酷乐光年', 'token 已自动同步', '签到将使用最新 token');
    } else {
      console.log('token 同步失败: ' + JSON.stringify(updateData));
      $notify('酷乐光年', 'token 同步失败', updateData.message || '未知错误');
    }
    $done();
  }, function (reason) {
    console.log('请求异常: ' + JSON.stringify(reason));
    $notify('酷乐光年', 'token 同步失败', '网络错误');
    $done();
  });
}
