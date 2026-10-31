// Quantumult X 脚本：酷乐光年 token 自动同步到青龙面板
// 功能：拦截小程序请求，提取 Authorization 头，自动更新到青龙面板的环境变量
// 触发：每次小程序发起请求时（pw.gzych.vip/*）
// 配置：在 QX 重写规则中添加 ^https://pw\.gzych\.vip/.* script-path=本脚本URL, requires-body=true, tag=酷乐光年token同步

const panelUrl = 'http://192.168.6.114:5700';
const panelUser = 'bmfy';
const panelPass = 'Dangopi314';

async function syncToken() {
  const authHeader = $request.headers.Authorization;
  if (!authHeader || !authHeader.startsWith('Token ')) {
    console.log('未找到有效的 Authorization 头，跳过');
    return;
  }
  
  const token = authHeader;
  console.log('捕获到 token:', token.slice(0, 30) + '...');
  
  try {
    const loginRes = await $http.post(`${panelUrl}/api/user/login`, {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: panelUser, password: panelPass }),
    });
    
    const loginData = JSON.parse(loginRes.body);
    if (loginData.code !== 200) {
      console.log('面板登录失败:', JSON.stringify(loginData));
      return;
    }
    
    const panelToken = loginData.data.token;
    console.log('面板登录成功');
    
    const envsRes = await $http.get(`${panelUrl}/api/envs?searchValue=KULE_SIGN_HEADERS`, {
      headers: { Authorization: `Bearer ${panelToken}` },
    });
    
    const envsData = JSON.parse(envsRes.body);
    const existing = envsData.data?.find(e => e.name === 'KULE_SIGN_HEADERS');
    
    const newHeaders = JSON.stringify({
      Authorization: token,
      'User-Agent': 'Mozilla/5.0 (iPad; CPU OS 16_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.79(0x18004f31) NetType/WIFI Language/zh_CN'
    });
    
    let updateRes;
    if (existing) {
      updateRes = await $http.put(`${panelUrl}/api/envs`, {
        headers: { 
          Authorization: `Bearer ${panelToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          id: existing.id,
          name: 'KULE_SIGN_HEADERS',
          value: newHeaders
        }),
      });
    } else {
      updateRes = await $http.post(`${panelUrl}/api/envs`, {
        headers: { 
          Authorization: `Bearer ${panelToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify([{
          name: 'KULE_SIGN_HEADERS',
          value: newHeaders
        }]),
      });
    }
    
    const updateData = JSON.parse(updateRes.body);
    if (updateData.code === 200) {
      console.log('✅ token 同步成功');
      $notify('酷乐光年', 'token 已自动同步', '签到将使用最新 token');
    } else {
      console.log('❌ token 同步失败:', JSON.stringify(updateData));
      $notify('酷乐光年', 'token 同步失败', updateData.message || '请检查');
    }
  } catch (e) {
    console.log('同步出错:', e.message);
    $notify('酷乐光年', 'token 同步出错', e.message);
  }
}

syncToken().then(() => {
  $done({});
}).catch(e => {
  console.log('脚本执行失败:', e);
  $done({});
});
