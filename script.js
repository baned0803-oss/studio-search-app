const AIRTABLE_CSV_URL = '';
const LSKEY = 'studio_search_conditions_v2';

function toMinutes(hhmm){
    if(!hhmm) return null;
    const [h,m] = hhmm.split(':').map(Number);
    return h*60 + m;
}

function escapeHtml(s){ return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function escapeAttr(s){ return String(s || '').replace(/"/g,'&quot;'); }

const timeInput = document.getElementById('timeInput');
const priceInput = document.getElementById('priceInput');
// 修正前: 希望人数に戻す
const peopleInput = document.getElementById('peopleInput'); 
const searchBtn = document.getElementById('searchBtn');
const result = document.getElementById('result');

const saved = JSON.parse(localStorage.getItem(LSKEY) || '{}');
if(saved.time) timeInput.value = saved.time;
if(saved.price) priceInput.value = saved.price;
// 修正前: 人数を読み込む
if(saved.people) peopleInput.value = saved.people; 

// 料金表示: パック料金対応のため、1人あたりの計算は行わない
function formatPrice(price) {
    if (price === null) return '計算対象外';
    return `¥${Math.round(price).toLocaleString()}`;
}

function renderCards(items, requestedPeople, requestedTime){
    result.innerHTML = '';
    if(items.length === 0){
        result.innerHTML = '<div class="no-results">該当するスタジオは見つかりませんでした。<br>条件を変更して再度検索してください。</div>';
        return;
    }
    
    // サマリー表示
    const summaryHtml = `
        <div class="summary">
            <p>✨ <strong>${items.length}件</strong>のスタジオが見つかりました (希望人数: ${requestedPeople}人, 検索時間: ${requestedTime})</p>
        </div>
    `;
    result.innerHTML = summaryHtml;


    const grid = document.createElement('div');
    grid.className = 'card-grid';

    items.forEach(it=>{
        if (!it.rate || !it.room) return;
        
        const div = document.createElement('div');
        div.className = 'card';

        // 料金の補足情報
        const priceNote = (it.rate.rate_name.includes('一括') || it.room.room_name.includes('パック'))
            ? ' (パック料金)' : ' (1時間あたり)';
        
        // 料金表示
        const costHtml = it.rate.min_price !== null
            ? `<div class="cost-per-person">
                  <div class="label">${escapeHtml(it.rate.rate_name || 'プラン料金')}</div>
                  <div class="price">${formatPrice(it.rate.min_price)}</div>
               </div>`
            : '<div class="cost-per-person disabled"><div class="price">料金未設定</div></div>';

        div.innerHTML = `
            <div>
                <h3>${escapeHtml(it.studio_name)}</h3>
                <div class="room-name">${escapeHtml(it.room_name)}</div>
                
                ${costHtml}

                <div class="meta-item">
                    <span>料金 (${escapeHtml(it.rate.rate_name || '')})</span>
                    <strong>${priceNote}</strong> 
                </div>
                <div class="meta-item">
                    <span>推奨最大人数</span>
                    <strong>${(it.room.recommended_max ?? '-')}人</strong>
                </div>
                <div class="meta-item">
                    <span>部屋面積</span>
                    <strong>${(it.room.area_sqm ?? '-')}㎡</strong>
                </div>
            </div>
            <a href="${escapeAttr(it.studio_url || '#')}" target="_blank">
                <button>この部屋の公式サイトへ →</button>
            </a>
        `;
        grid.appendChild(div);
    });
    
    result.appendChild(grid);
}

function runSearch(studios){
    function search(){
        const st = timeInput.value;
        const maxPrice = priceInput.value ? Number(priceInput.value) : Infinity;
        // 修正前: 希望人数を取得
        const requestedPeople = peopleInput.value ? Number(peopleInput.value) : 0; 
        
        // LocalStorageのキーを更新 (area -> people に戻す)
        localStorage.setItem(LSKEY, JSON.stringify({time:st, price: priceInput.value, people: peopleInput.value}));
        
        const tmin = toMinutes(st);
        const results = [];

        if(requestedPeople <= 0) {
            renderCards([], requestedPeople, st);
            return;
        }

        studios.forEach(studio=>{
            (studio.rooms || []).forEach(room=>{
                (room.rates || []).forEach(rate=>{
                    const s = toMinutes(rate.start_time);
                    const e = toMinutes(rate.end_time);
                    
                    if(tmin === null) return;
                    // 時間帯フィルタ
                    if(!(s <= tmin && tmin < e)) return;
                    // 価格フィルタ
                    if(rate.min_price != null && rate.min_price > maxPrice) return; 
                    // 修正前: 推奨人数フィルタ: 部屋の推奨最大人数が希望人数以上であるか
                    if(room.recommended_max != null && room.recommended_max < requestedPeople) return; 
                    
                    results.push({
                        studio_name: studio.studio_name,
                        studio_url: studio.official_url,
                        room_name: room.room_name,
                        room: room,
                        rate: rate,
                    });
                });
            });
        });

        // 価格順（安い順）にソート
        results.sort((a,b)=>(a.rate.min_price ?? Infinity) - (b.rate.min_price ?? Infinity));
        renderCards(results, requestedPeople, st);
    }

    searchBtn.addEventListener('click', search);
    [timeInput, priceInput, peopleInput].forEach(inp=>{
        inp.addEventListener('keydown', (e)=>{ if(e.key === 'Enter') search(); });
    });
    search();
}

function cleanRateData(r) {
    let price = (r.min_price || '').toString().replace(/[^\d.]/g, '');
    price = price ? Number(price) : null;
    
    // 時間の形式チェック
    const startTimeMatch = (r.start_time || '').match(/(\d{2}:\d{2})$/);
    const endTimeMatch = (r.end_time || '').match(/(\d{2}:\d{2})$/);

    return {
        rate_name: (r.rate_name||'').trim(),
        start_time: startTimeMatch ? startTimeMatch[1] : (r.start_time||'').trim(),
        end_time: endTimeMatch ? endTimeMatch[1] : (r.end_time||'').trim(),
        min_price: price 
    };
}

// JSONデータを処理し、スタジオ/部屋/料金に構造化する
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
                 // 面積情報も保持
                 area_sqm: r.area_sqm ? Number(r.area_sqm) : null,
                 // 推奨人数をフィルタに使用
                 recommended_max: r.recommended_max ? Number(r.recommended_max) : null,
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

// (AirTable CSVの取得ロジックは省略)

async function initializeApp(){
    try{
        let studios;
        
        if (!timeInput.value) { timeInput.value = '18:00'; }
        if (!priceInput.value) { priceInput.value = '5000'; }
        if (!peopleInput.value) { peopleInput.value = '10'; } // 初期値を人数 10人に
        
        if(AIRTABLE_CSV_URL && AIRTABLE_CSV_URL.trim() !== ''){
            console.log('Airtable CSVからのデータ取得を開始します...');
            // studios = await fetchCsvToStudios(AIRTABLE_CSV_URL); // 実装省略
            throw new Error('AirTable連携は現在停止中です。');
        } else {
            console.log('data.jsonからデータを読み込みます。');
            studios = await fetchLocalJson();
        }
        
        console.log('--- 読み込まれた最終データ ---');
        console.log(studios); 
        
        runSearch(studios);
        
    }catch(err){
        console.error('データの読み込みに失敗しました。', err);
        result.innerHTML = '<div class="no-results" style="color:#ef4444;">データの読み込みに失敗しました。<br>コンソール (F12) のエラーを確認してください。</div>';
    }
}

document.addEventListener('DOMContentLoaded', initializeApp);