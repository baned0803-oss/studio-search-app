// script.js (index.html用 - フォーム処理とリダイレクトのみ)

const LSKEY = 'studio_search_conditions_v4';
const AREA_PER_PERSON = 5; 

// DOM要素の取得
const timeInput = document.getElementById('timeInput');
const priceInput = document.getElementById('priceInput');
const peopleInput = document.getElementById('peopleInput'); 
const searchBtn = document.getElementById('searchBtn');
const areaInfo = document.getElementById('areaInfo');
const searchModeDayBtn = document.getElementById('searchModeDay');
const searchModeNightBtn = document.getElementById('searchModeNight');

let searchMode = 'day'; 

// LocalStorageからの初期値読み込みとUIの初期化
const saved = JSON.parse(localStorage.getItem(LSKEY) || '{}');
if(saved.time) timeInput.value = saved.time;
if(saved.price) priceInput.value = saved.price;
if(saved.people) peopleInput.value = saved.people; 
if(saved.mode) {
    searchMode = saved.mode;
    if (searchMode === 'night') {
        searchModeDayBtn.classList.remove('active');
        searchModeNightBtn.classList.add('active');
        timeInput.style.display = 'none';
        areaInfo.textContent = '深夜パックは時間帯に関係なく検索されます。';
        searchBtn.textContent = '🌜 深夜パックを検索';
    } else {
        timeInput.style.display = 'block';
        searchBtn.textContent = '🔍 スタジオを検索';
    }
} else {
    // 初回デフォルト値設定
    if (!timeInput.value) timeInput.value = '18:00';
    if (!priceInput.value) priceInput.value = '5000';
    if (!peopleInput.value) peopleInput.value = '5';
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

// 検索モード切り替え時のUI更新
searchModeDayBtn.addEventListener('click', ()=>{
    searchMode = 'day';
    searchModeDayBtn.classList.add('active');
    searchModeNightBtn.classList.remove('active');
    timeInput.style.display = 'block';
    searchBtn.textContent = '🔍 スタジオを検索';
    updateAreaInfo(Number(peopleInput.value));
});

searchModeNightBtn.addEventListener('click', ()=>{
    searchMode = 'night';
    searchModeDayBtn.classList.remove('active');
    searchModeNightBtn.classList.add('active');
    timeInput.style.display = 'none';
    searchBtn.textContent = '🌜 深夜パックを検索';
    areaInfo.textContent = '深夜パックは時間帯に関係なく検索されます。';
});

// 検索ボタン押下時の処理 (リダイレクト)
function handleSearch(){
    const st = timeInput.value || '00:00';
    const maxPrice = priceInput.value || 999999;
    const requestedPeople = peopleInput.value || 0; 
    
    if (Number(requestedPeople) <= 0) {
        alert('希望人数は1人以上である必要があります。');
        return;
    }

    // LocalStorageに現在の状態を保存
    localStorage.setItem(LSKEY, JSON.stringify({time:st, price: priceInput.value, people: requestedPeople, mode: searchMode}));

    // URLパラメータを作成して results.html へ遷移
    const params = new URLSearchParams();
    params.append('time', st);
    params.append('price', maxPrice);
    params.append('people', requestedPeople);
    params.append('mode', searchMode);
    
    // ⭐ 新しい結果ページに遷移 ⭐
    window.location.href = `results.html?${params.toString()}`;
}

searchBtn.addEventListener('click', handleSearch);
[timeInput, priceInput, peopleInput].forEach(inp=>{
    inp.addEventListener('keydown', (e)=>{ if(e.key === 'Enter') handleSearch(); });
});

document.addEventListener('DOMContentLoaded', () => {
    updateAreaInfo(Number(peopleInput.value));
});