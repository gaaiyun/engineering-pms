/**
 * AI 功能状态检查脚本（无需管理员权限）
 * 
 * 运行: node scripts/check_ai_status.mjs
 */

const PB_URL = (process.env.PB_URL || 'http://127.0.0.1:8090').trim();

console.log('🔍 AI 功能状态检查');
console.log('='.repeat(50));
console.log(`📡 PocketBase URL: ${PB_URL}`);

async function checkPocketBase() {
    console.log('\n1️⃣ 检查 PocketBase 服务状态...');
    try {
        const healthRes = await fetch(`${PB_URL}/api/health`);
        const health = await healthRes.json();
        console.log(`   ✅ PocketBase 服务正常: ${JSON.stringify(health)}`);
    } catch (error) {
        console.log(`   ❌ PocketBase 服务不可达: ${error.message}`);
        return false;
    }
    return true;
}

async function checkCollections() {
    console.log('\n2️⃣ 检查关键集合是否存在...');
    
    const collections = ['ai_summaries', 'notifications', 'handoffs', 'audit_logs', 'comments'];
    const results = {};
    
    for (const name of collections) {
        try {
            // 尝试获取集合信息（不需要认证）
            const res = await fetch(`${PB_URL}/api/collections/${name}`);
            if (res.ok) {
                const data = await res.json();
                results[name] = { exists: true, fieldsCount: data.schema?.length || 0 };
                console.log(`   ✅ ${name}: 存在 (${data.schema?.length || 0} 个字段)`);
            } else if (res.status === 404) {
                results[name] = { exists: false };
                console.log(`   ❌ ${name}: 不存在`);
            } else {
                results[name] = { exists: 'unknown', status: res.status };
                console.log(`   ⚠️ ${name}: 状态未知 (HTTP ${res.status})`);
            }
        } catch (error) {
            results[name] = { exists: 'error', error: error.message };
            console.log(`   ⚠️ ${name}: 检查失败 (${error.message})`);
        }
    }
    
    return results;
}

async function checkAIAPI() {
    console.log('\n3️⃣ 检查 SiliconFlow AI API 连接...');
    
    try {
        // 只检查 API 是否可达（不发送实际请求）
        const res = await fetch('https://api.siliconflow.cn/v1/models', {
            method: 'GET',
            headers: {
                'Authorization': 'Bearer test' // 使用无效 key 测试连接
            }
        });
        
        if (res.status === 401) {
            console.log('   ✅ SiliconFlow API 可达 (需要有效 API Key)');
            return true;
        } else if (res.ok) {
            console.log('   ✅ SiliconFlow API 正常');
            return true;
        } else {
            console.log(`   ⚠️ SiliconFlow API 响应异常: HTTP ${res.status}`);
            return false;
        }
    } catch (error) {
        console.log(`   ❌ SiliconFlow API 不可达: ${error.message}`);
        return false;
    }
}

async function generateDiagnosis(pbOk, collections, aiOk) {
    console.log('\n' + '='.repeat(50));
    console.log('📋 诊断结果汇总');
    console.log('='.repeat(50));
    
    const issues = [];
    
    if (!pbOk) {
        issues.push('❌ PocketBase 服务不可用');
    }
    
    if (!collections['ai_summaries']?.exists) {
        issues.push('❌ ai_summaries 集合不存在 - 这是 AI 报告无法保存的主要原因');
    }
    
    if (!collections['notifications']?.exists) {
        issues.push('⚠️ notifications 集合不存在 - 通知功能可能不可用');
    }
    
    if (!aiOk) {
        issues.push('⚠️ SiliconFlow AI API 可能不可达');
    }
    
    if (issues.length === 0) {
        console.log('\n✅ 所有检查通过！');
        console.log('\n如果 AI 报告仍然无法生成，请确认：');
        console.log('   1. 在 AI 控制台中设置了有效的 SiliconFlow API Key');
        console.log('   2. API Key 格式正确 (sk-...)');
        console.log('   3. 选择的 AI 模型支持 JSON 输出');
    } else {
        console.log('\n🔴 发现以下问题：');
        issues.forEach((issue, i) => console.log(`   ${i + 1}. ${issue}`));
        
        console.log('\n🔧 修复建议：');
        if (!collections['ai_summaries']?.exists) {
            console.log('   需要创建 ai_summaries 集合。请在 PocketBase 管理界面中：');
            console.log(`   1. 访问 ${PB_URL}/_/ `);
            console.log('   2. 登录管理员账号');
            console.log('   3. 创建名为 "ai_summaries" 的集合');
            console.log('   4. 添加字段: target_user(relation), date, content, risk_level, model_used, input_snapshot');
        }
    }
}

async function main() {
    const pbOk = await checkPocketBase();
    const collections = await checkCollections();
    const aiOk = await checkAIAPI();
    await generateDiagnosis(pbOk, collections, aiOk);
}

main();
