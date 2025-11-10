// results.js (検索ロジックと結果表示)

const AREA_PER_PERSON = 5; 

// --- ユーティリティ関数（共通） ---
function toMinutes(hhmm){
    if(!hhmm) return null;
    const [h,m] = hhmm.split(':').map(Number);
    return h*60 + m;
}
function escapeHtml(s){ return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function escapeAttr(s){ return String(s || '').replace(/"/g,'&quot;'); }
function formatPrice(price) { return price !== null ? `¥${Math.round(price).toLocaleString()}` : '料金未設定'; }

// データクリーンアップロジック（変更なし）
function cleanRateData(r) {
    let price = (r.min_price || '').toString().replace(/[^\d.]/g, '');
    price = price ? Number(price) : null;
    
    const startTimeMatch = (r.start_time || '').match(/(\d{2}:\d{2})$/);
    const endTimeMatch = (r.end_time || '').match(/(\d{2}:\d{2})$/);

    return {
        rate_name: (r.rate_name||'').trim(),
        start_time: startTimeMatch ? startTimeMatch[1] : (r.start_time||'').trim(),
        end_time: endTimeMatch ? endTimeMatch[1] : (r.end_time||'').trim(),
        min_price: price 
    };
}

function processFetchedData(rows) {
    const studiosMap = {};
    rows.forEach(r=>{
         const sid = (r.studio_id || r.studio_name || '').toString().trim();
         if(!sid) return;

         if(!studiosMap[sid]) {
             studiosMap[sid] = { 
                 id: sid, 
                 studio_name: (r.studio_name||'').trim(), 
                 official_url: (r.official_url||'').trim(), 
                 rooms: {} 
             };
         }
         const s = studiosMap[sid];

         const rid = (r.room_id || r.room_name || '').toString().trim();
         if(!rid) return;
         
         if(!s.rooms[rid]) {
             s.rooms[rid] = { 
                 id: rid, 
                 room_name: (r.room_name||'').trim(), 
                 area_sqm: r.area_sqm ? Number(r.area_sqm) : null, 
                 recommended_max: r.recommended_max ? Number(r.recommended_max) : null,
                 notes: (r.notes || '').trim(), 
                 rates: [] 
             };
         }
         
         const rate = cleanRateData(r);

         if(rate.rate_name && rate.start_time && rate.min_price !== null) {
              s.rooms[rid].rates.push(rate);
         }
    });

    return Object.values(studiosMap).map(s=>({ id: s.id, studio_name: s.studio_name, official_url: s.official_url, rooms: Object.values(s.rooms) }));
}

async function fetchLocalJson(){ 
    const res = await fetch('data.json');
    if(!res.ok) throw new Error('data.json fetch failed: '+res.status + ' - JSONファイルが見つからないか、パスが間違っています。');
    const data = await res.json();
    return processFetchedData(data);
}

// --- レンダリング関数 ---
function renderCards(items, requestedPeople, requestedArea, searchMode){
    const resultElement = document.getElementById('result');
    const summaryElement = document.getElementById('searchSummary');
    
    if(items.length === 0){
        resultElement.innerHTML = '<div class="no-results">該当するスタジオは見つかりませんでした。<br>検索ページに戻り、条件を変更してください。</div>';
        summaryElement.innerHTML = `0件のスタジオが見つかりました (${requestedPeople}名 / 必要面積: ${requestedArea}㎡)`;
        return;
    }
    
    const modeName = searchMode === 'night' ? '🌜 深夜パック' : '🌞 通常時間帯';
    
    // サマリー表示を更新
    summaryElement.innerHTML = `
        ✨ <strong>${items.length}件</strong>のスタジオが見つかりました (${modeName}) 
        <span class="summary-details">| 希望人数: ${requestedPeople}名 / 必要面積: ${requestedArea}㎡</span>
    `;

    resultElement.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'card-grid';

    items.forEach(it=>{
        if (!it.rate || !it.room) return;
        
        const div = document.createElement('div');
        div.className = 'card';

        // 1人あたりor全体価格
        let costHtml;
        if (searchMode === 'night') {
             // 深夜パックの場合、全体料金として表示
             costHtml = `<div class="cost-per-person">
                            <div class="label">パック料金 (${escapeHtml(it.rate.rate_name)})</div>
                            <div class="price">${formatPrice(it.rate.min_price)}</div>
                         </div>`;
        } else {
             // 通常料金の場合、1人あたり料金を算出
             const isCalculable = it.rate.min_price != null && requestedPeople > 0;
             const costPerPerson = isCalculable ? it.rate.min_price / requestedPeople : null;
             costHtml = costPerPerson
                ? `<div class="cost-per-person">
                      <div class="label">1人あたり (1h)</div>
                      <div class="price">${formatPrice(costPerPerson)}</div>
                   </div>`
                : '<div class="cost-per-person disabled"><div class="price">計算対象外</div></div>';
        }
        
        // 部屋の面積と適合性をチェック
        const roomArea = it.room.area_sqm;
        const areaFitStatus = roomArea && roomArea >= requestedArea ? `適合 (${roomArea}㎡)` : `**注意** (${roomArea ?? '未記載'}㎡)`;
        const areaFitClass = roomArea && roomArea >= requestedArea ? '' : 'warning';
        
        // 備考情報
        const notes = it.room.notes || '特記事項なし';
        
        div.innerHTML = `
            <div>
                <h3>${escapeHtml(it.studio_name)}</h3>
                <div class="room-name">${escapeHtml(it.room_name)}</div>
                
                ${costHtml}

                <div class="meta-item">
                    <span>利用時間帯</span>
                    <strong>${searchMode === 'night' ? '深夜パック' : `${escapeHtml(it.rate.start_time)}〜${escapeHtml(it.rate.end_time)}`}</strong>
                </div>
                <div class="meta-item">
                    <span>必要面積 (目安)</span>
                    <strong class="${areaFitClass}">${areaFitStatus}</strong> 
                </div>
                <div class="meta-item">
                    <span>推奨最大人数</span>
                    <strong>${(it.room.recommended_max ?? '-')}人</strong>
                </div>
                <div class="meta-item">
                    <span>その他/備考</span>
                    <strong>${escapeHtml(notes)}</strong>
                </div>
            </div>
            <a href="${escapeAttr(it.studio_url || '#')}" target="_blank">
                <button>公式サイトで料金をチェック →</button>
            </a>
        `;
        grid.appendChild(div);
    });
    
    resultElement.appendChild(grid);
}

// --- 検索ロジック本体 ---
function runSearch(studios, params){
    const st = params.time;
    const maxPrice = params.price;
    const requestedPeople = params.people; 
    const searchMode = params.mode;

    const tmin = toMinutes(st);
    const requiredArea = requestedPeople * AREA_PER_PERSON;

    if(requestedPeople <= 0) {
        renderCards([], 0, 0, searchMode);
        return;
    }
    
    const results = [];

    studios.forEach(studio=>{
        (studio.rooms || []).forEach(room=>{
            // 必須条件: 部屋の面積が必要面積以上であること
            if(room.area_sqm == null || room.area_sqm < requiredArea) return; 

            (room.rates || []).forEach(rate=>{
                const rateName = (rate.rate_name || '').toLowerCase();
                const isNightPack = rateName.includes('深夜') || rateName.includes('ナイトパック');
                
                const matchesMode = (searchMode === 'day' && !isNightPack) || 
                                    (searchMode === 'night' && isNightPack);

                if(!matchesMode) return;
                
                if(searchMode === 'day'){
                     const s = toMinutes(rate.start_time);
                     const e = toMinutes(rate.end_time);
                     
                     // 時間帯フィルタ (Dayモードのみ)
                     if(tmin === null || !(s <= tmin && tmin < e)) return;
                } 

                // 価格フィルタ
                if(rate.min_price != null && rate.min_price > maxPrice) return; 
                
                
                // ここに到達した部屋は適合とみなし、結果に追加
                results.push({
                    studio_name: studio.studio_name,
                    studio_url: studio.official_url,
                    room_name: room.room_name,
                    room: room,
                    rate: rate,
                    cost_per_person: searchMode === 'day' ? rate.min_price / requestedPeople : null 
                });
            });
        });
    });

    // ソート: Dayモードは1人あたり価格順、Nightモードは全体価格順
    results.sort((a,b)=>{
        if(searchMode === 'day'){
            return (a.cost_per_person ?? Infinity) - (b.cost_per_person ?? Infinity);
        } else {
            return (a.rate.min_price ?? Infinity) - (b.rate.min_price ?? Infinity);
        }
    });

    renderCards(results, requestedPeople, requiredArea, searchMode);
}

// --- 初期化処理 ---

// URLパラメータから検索条件を取得
function getSearchParams() {
    const urlParams = new URLSearchParams(window.location.search);
    return {
        time: urlParams.get('time') || '00:00',
        price: Number(urlParams.get('price')) || Infinity,
        people: Number(urlParams.get('people')) || 0,
        mode: urlParams.get('mode') || 'day'
    };
}

async function initializeApp(){
    try{
        const params = getSearchParams();
        
        if (params.people <= 0) {
             document.getElementById('result').innerHTML = '<div class="no-results">無効な検索条件です。検索ページに戻り、人数を指定してください。</div>';
             document.getElementById('searchSummary').textContent = '';
             return;
        }
        
        // データ読み込み
        const studios = await fetchLocalJson();
        
        // 検索実行
        runSearch(studios, params);
        
    }catch(err){
        console.error('データの読み込みまたは検索処理に失敗しました。', err);
        document.getElementById('result').innerHTML = '<div class="no-results" style="color:#ef4444;">データの読み込みに失敗しました。<br>コンソール (F12) のエラーを確認してください。</div>';
    }
}

document.addEventListener('DOMContentLoaded', initializeApp);