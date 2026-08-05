/**
 * 浏览器无法直连 Discord Webhook（CORS），用这个免费 Cloudflare Worker 中转。
 *
 * 用法：
 * 1. Discord 频道 → 编辑频道 → 整合 → Webhook → 复制 URL
 * 2. https://dash.cloudflare.com → Workers → Create → 粘贴本文件
 * 3. Worker Settings → Variables → Secrets 添加 DISCORD_WEBHOOK = 上一步 URL
 * 4. 部署后复制 Worker 地址，例如 https://rtc-telemetry.xxx.workers.dev
 * 5. GitHub 仓库 Settings → Secrets → Actions 添加 TELEMETRY_WEBHOOK = Worker 地址
 * 6. 再推一次 main（或手动跑 Deploy workflow）
 */
export default {
  async fetch(request, env) {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return new Response('method not allowed', { status: 405, headers: cors });
    if (!env.DISCORD_WEBHOOK) return new Response('missing DISCORD_WEBHOOK', { status: 500, headers: cors });

    const incoming = await request.text();
    let outbound = incoming;
    try {
      const parsed = JSON.parse(incoming);
      if (parsed?.event && parsed?.stats && !parsed?.content) {
        const s = parsed.stats;
        const mins = Math.round((s.playTimeMs || 0) / 60000);
        const lines = [
          `事件 **${parsed.event.name}** · 构建 \`${parsed.build || '?'}\``,
          `玩家 \`${parsed.playerId}\``,
          `会话 ${s.sessions} · 探索 ${s.runs} · 回府 ${s.runEnds} · 死亡 ${s.deaths}`,
          `胜 ${s.combatWins} · 逃 ${s.combatFlees} · 炼制 ${s.crafts} · 游玩约 ${mins} 分`,
          `巅峰 Lv.${s.peakRealmLevel} · 图档 ${JSON.stringify(s.tiers || {})}`
        ];
        if (parsed.event.data) lines.push('详情：`' + JSON.stringify(parsed.event.data) + '`');
        outbound = JSON.stringify({ content: lines.join('\n') });
      }
    } catch {
      /* 已是 Discord 格式则原样转发 */
    }

    const upstream = await fetch(env.DISCORD_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: outbound
    });
    return new Response(upstream.ok ? 'ok' : 'upstream error', {
      status: upstream.ok ? 200 : 502,
      headers: cors
    });
  }
};
