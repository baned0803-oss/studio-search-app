const AIRTABLE_CSV_URL = '';
const LSKEY = 'studio_search_conditions_v3';
// ⭐ 面積計算の定数: 一人あたりに必要な面積 (㎡)
const AREA_PER_PERSON = 5; 

function toMinutes(hhmm){
    if(!hhmm) return null;
    const [h,m] = hhmm.split(':').map(Number);
    return h*60 + m;
}

function escapeHtml(s){ return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function escapeAttr(s){ return String(s || '').replace(/"/g,'&quot;'); }
function formatPrice(price) { return price !== null ? `¥${Math.round(price).toLocaleString()}` : '料金未設定'; }


// DOM要素の取得
const timeInput = document.getElementById('timeInput');
const priceInput = document.getElementById('priceInput');
const peopleInput = document.getElementById('peopleInput'); 
const searchBtn = document.getElementById('searchBtn');
const result = document.getElementById('result');
const areaInfo = document.getElementById('areaInfo');
const searchModeDayBtn = document.getElementById('searchModeDay');
const searchModeNightBtn = document.getElementById('searchModeNight');

// 状態管理
let searchMode = 'day'; // 'day' または 'night'

// LocalStorageからの初期値読み込み
const saved = JSON.parse(localStorage.getItem(LSKEY) || '{}');
if(saved.time) timeInput.value = saved.time;
if(saved.price) priceInput.value = saved.price;
if(saved.people) peopleInput.value = saved.people; 
if(saved.mode) {
    searchMode = saved.mode;
    // UIを初期モードに合わせる
    if (searchMode === 'night') {
        searchModeDayBtn.classList.remove('active');
        searchModeNightBtn.classList.add('active');
        timeInput.style.display = 'none'; // 時間入力は非表示
        areaInfo.textContent = '深夜パックは時間帯に関係なく検索されます。';
    } else {
        timeInput.style.display = 'block';
    }
}


function updateAreaInfo(people) {
    if (people > 0) {
        const requiredArea = people * AREA_PER_PERSON;
        areaInfo.innerHTML = `人数 (${people}人) に必要な目安の広さ: <strong>${requiredArea}㎡</strong>`;
    } else {
        areaInfo.textContent = '希望人数を入力してください。';
    }
}

peopleInput.addEventListener('input', () => {
    updateAreaInfo(Number(peopleInput.value));
});

function renderCards(items, requestedPeople, requestedArea){
    result.innerHTML = '';
    if(items.length === 0){
        result.innerHTML = '<div class="no-results">該当するスタジオは見つかりませんでした。<br>条件を変更して再度検索してください。</div>';
        return;
    }
    
    const modeName = searchMode === 'night' ? '🌜 深夜パック' : '🌞 通常時間帯';
    
    // サマリー表示
    const summaryHtml = `
        <div class="summary">
            <p>✨ <strong>${items.length}件</strong>のスタジオが見つかりました (${modeName} / 希望人数: ${requestedPeople}名 / 必要面積: ${requestedArea}㎡)</p>
        </div>
    `;
    result.innerHTML = summaryHtml;


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
    
    result.appendChild(grid);
}

function runSearch(studios){
    function search(){
        const st = timeInput.value;
        const maxPrice = priceInput.value ? Number(priceInput.value) : Infinity;
        const requestedPeople = peopleInput.value ? Number(peopleInput.value) : 0; 
        
        if(requestedPeople <= 0) {
            renderCards([], 0, 0);
            return;
        }

        const tmin = toMinutes(st);
        const requiredArea = requestedPeople * AREA_PER_PERSON;

        // LocalStorageに現在の状態を保存
        localStorage.setItem(LSKEY, JSON.stringify({time:st, price: priceInput.value, people: peopleInput.value, mode: searchMode}));
        
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
                    // else {
                    //     Nightモードの場合、時間帯フィルタは適用しない（パック期間全体を対象とする）
                    // }

                    // 価格フィルタ
                    if(rate.min_price != null && rate.min_price > maxPrice) return; 
                    
                    
                    // ここに到達した部屋は適合とみなし、結果に追加
                    results.push({
                        studio_name: studio.studio_name,
                        studio_url: studio.official_url,
                        room_name: room.room_name,
                        room: room,
                        rate: rate,
                        cost_per_person: searchMode === 'day' ? rate.min_price / requestedPeople : null // Dayモードのみ計算
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

        renderCards(results, requestedPeople, requiredArea);
    }

    // 検索モード切り替えイベント
    searchModeDayBtn.addEventListener('click', ()=>{
        searchMode = 'day';
        searchModeDayBtn.classList.add('active');
        searchModeNightBtn.classList.remove('active');
        timeInput.style.display = 'block';
        searchBtn.textContent = '🔍 スタジオを検索';
        updateAreaInfo(Number(peopleInput.value));
        search();
    });

    searchModeNightBtn.addEventListener('click', ()=>{
        searchMode = 'night';
        searchModeDayBtn.classList.remove('active');
        searchModeNightBtn.classList.add('active');
        timeInput.style.display = 'none'; // 時間入力は非表示
        searchBtn.textContent = '🌜 深夜パックを検索';
        areaInfo.textContent = '深夜パックは時間帯に関係なく検索されます。';
        search();
    });
    
    // 検索実行イベントリスナー
    searchBtn.addEventListener('click', search);
    [timeInput, priceInput, peopleInput].forEach(inp=>{
        inp.addEventListener('keydown', (e)=>{ if(e.key === 'Enter') search(); });
    });
    
    // 初回実行時に面積情報を更新してから検索
    updateAreaInfo(Number(peopleInput.value));
    search();
}

// データ処理ロジック (変更なし、備考Notesを追加)
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
                 area_sqm: r.area_sqm ? Number(r.area_sqm) : null, // 面積情報を利用
                 recommended_max: r.recommended_max ? Number(r.recommended_max) : null,
                 notes: (r.notes || '').trim(), // 備考情報を追加
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
        if (!peopleInput.value) { peopleInput.value = '5'; } 
        
        console.log('data.jsonからデータを読み込みます。');
        studios = await fetchLocalJson();
        
        console.log('--- 読み込まれた最終データ ---');
        console.log(studios); 
        
        runSearch(studios);
        
    }catch(err){
        console.error('データの読み込みに失敗しました。', err);
        result.innerHTML = '<div class="no-results" style="color:#ef4444;">データの読み込みに失敗しました。<br>コンソール (F12) のエラーを確認してください。</div>';
    }
}

document.addEventListener('DOMContentLoaded', initializeApp);