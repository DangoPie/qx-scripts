// Quantumult X 脚本：酷乐光年 token 自动同步到青龙面板
// 使用 $task.fetch() 发请求，$request 读取请求头，$notify 推送通知

const panelUrl = 'http://192.168.6.114:5700';
const panelUser = 'bmfy';
const panelPass = 'Dangopi314';

function syncToken() {
  const authHeader = $request.headers.Authorization;
  if (!authHeader || !authHeader.startsWith('Token ')) {
    console.log('未找到有效的 Authorization 头，跳过');
    $done({});
    return;
  }
  
  const token = authHeader;
  console.log('捕获到 token:', token.slice(0, 30) + '...');
  
  // 登录面板
  const loginBody = JSON.stringify({ username: panelUser, password: panelPass });
  $task.fetch({
    method: 'POST',
    url: `${panelUrl}/api/user/login`,
    headers: { 'Content-Type': 'application/json' },
    body: loginBody
  }).then(response => {
    const loginData = JSON.parse(response.body);
    if (loginData.code !== 200) {
      console.log('面板登录失败:', JSON.stringify(loginData));
      $notify('酷乐光年', 'token 同步失败', '面板登录失败');
      $done({});
      return;
    }
    
    const panelToken = loginData.data.token;
    console.log('面板登录成功');
    
    // 获取当前 KULE_SIGN_HEADERS
    return $task.fetch({
      method: 'GET',
      url: `${panelUrl}/api/envs?searchValue=KULE_SIGN_HEADERS`,
      headers: { Authorization: `Bearer ${panelToken}` }
    }).then(envResponse => {
      const envsData = JSON.parse(envResponse.body);
      const existing = envsData.data?.find(e => e.name === 'KULE_SIGN_HEADERS');
      
      const newHeaders = JSON.stringify({
        Authorization: token,
        'User-Agent': 'Mozilla/5.0 (iPad; CPU OS 16_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.79(0x18004f31) NetType/WIFI Language/zh_CN'
      });
      
      const updateHeaders = {
        Authorization: `Bearer ${panelToken}`,
        'Content-Type': 'application/json'
      };
      
      if (existing) {
        return $task.fetch({
          method: 'PUT',
          url: `${panelUrl}/api/envs`,
          headers: updateHeaders,
          body: JSON.stringify({ id: existing.id, name: 'KULE_SIGN_HEADERS', value: newHeaders })
        });
      } else {
        return $task.fetch({
          method: 'POST',
          url: `${panelUrl}/api/envs`,
          headers: updateHeaders,
          body: JSON.stringify([{ name: 'KULE_SIGN_HEADERS', value: newHeaders }])
        });
      }
    });
  }).then(updateResponse => {
    const updateData = JSON.parse(updateResponse.body);
    if (updateData.code === 200) {
      console.log('token 同步成功');
      $notify('酷乐光年', 'token 已自动同步', '签到将使用最新 token');
    } else {
      console.log('token 同步失败:', JSON.stringify(updateData));
      $notify('酷乐光年', 'token 同步失败', updateData.message || '请检查');
    }
    $done({});
  }).catch(error => {
    console.log('请求失败:', error);
    $notify('酷乐光年', 'token 同步失败', '网络错误');
    $done({});
  });
}

syncToken();
