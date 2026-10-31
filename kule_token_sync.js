// Quantumult X 脚本：酷乐光年 token 自动同步到青龙面板
// 使用 $httpClient 发请求，$request 读取请求头，$notification 推送通知

const panelUrl = 'http://192.168.6.114:5700'; // 青龙面板地址（如有 Tailscale 请改成 Tailscale IP）
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
  $httpClient.post({
    url: `${panelUrl}/api/user/login`,
    headers: { 'Content-Type': 'application/json' },
    body: loginBody
  }, (error, response, data) => {
    if (error) {
      console.log('面板登录请求失败:', error);
      $notification.post('酷乐光年', 'token 同步失败', '面板连接失败');
      $done({});
      return;
    }
    
    const loginData = JSON.parse(data);
    if (loginData.code !== 200) {
      console.log('面板登录失败:', JSON.stringify(loginData));
      $notification.post('酷乐光年', 'token 同步失败', '面板登录失败');
      $done({});
      return;
    }
    
    const panelToken = loginData.data.token;
    console.log('面板登录成功');
    
    // 获取当前 KULE_SIGN_HEADERS
    $httpClient.get({
      url: `${panelUrl}/api/envs?searchValue=KULE_SIGN_HEADERS`,
      headers: { Authorization: `Bearer ${panelToken}` }
    }, (error, response, data) => {
      if (error) {
        console.log('获取环境变量失败:', error);
        $done({});
        return;
      }
      
      const envsData = JSON.parse(data);
      const existing = envsData.data?.find(e => e.name === 'KULE_SIGN_HEADERS');
      
      const newHeaders = JSON.stringify({
        Authorization: token,
        'User-Agent': 'Mozilla/5.0 (iPad; CPU OS 16_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.79(0x18004f31) NetType/WIFI Language/zh_CN'
      });
      
      // 更新环境变量
      const updateHeaders = {
        Authorization: `Bearer ${panelToken}`,
        'Content-Type': 'application/json'
      };
      
      if (existing) {
        // PUT 更新
        $httpClient.put({
          url: `${panelUrl}/api/envs`,
          headers: updateHeaders,
          body: JSON.stringify({ id: existing.id, name: 'KULE_SIGN_HEADERS', value: newHeaders })
        }, (error, response, data) => {
          handleUpdateResult(error, data);
        });
      } else {
        // POST 创建
        $httpClient.post({
          url: `${panelUrl}/api/envs`,
          headers: updateHeaders,
          body: JSON.stringify([{ name: 'KULE_SIGN_HEADERS', value: newHeaders }])
        }, (error, response, data) => {
          handleUpdateResult(error, data);
        });
      }
    });
  });
}

function handleUpdateResult(error, data) {
  if (error) {
    console.log('更新环境变量失败:', error);
    $notification.post('酷乐光年', 'token 同步失败', '更新请求失败');
    $done({});
    return;
  }
  
  const updateData = JSON.parse(data);
  if (updateData.code === 200) {
    console.log('✅ token 同步成功');
    $notification.post('酷乐光年', 'token 已自动同步', '签到将使用最新 token');
  } else {
    console.log('❌ token 同步失败:', JSON.stringify(updateData));
    $notification.post('酷乐光年', 'token 同步失败', updateData.message || '请检查');
  }
  $done({});
}

syncToken();
