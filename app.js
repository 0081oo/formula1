/* ===================================================================
   F1 대시보드 애플리케이션 (app.js)
   - Google Sheets에서 CSV 데이터를 가져와 F1 통계 대시보드를 렌더링
   - 바닐라 자바스크립트만 사용 (프레임워크 없음)
   =================================================================== */

/* --- Google Sheets CSV 내보내기 URL 상수 (GID 기반) --- */
const SHEET_ID = '15QqBovMWmwoLoGdRRPeUqi3qvUJ7hBUSHCqSqu3MkUQ';
const BASE_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv`;

/* 각 시트별 GID (Google Sheets 내부 시트 식별자) */
const URLS = {
    drivers: `${BASE_URL}&gid=0`,                 // 드라이버 기본 정보
    races: `${BASE_URL}&gid=752042075`,            // 레이스 일정 및 정보
    results: `${BASE_URL}&gid=949480846`,          // 레이스 결과 데이터
    constructorStandings: `${BASE_URL}&gid=449190692`,  // 컨스트럭터 순위
    driverStandings: `${BASE_URL}&gid=1424115034`,      // 드라이버 순위
};

/* --- 전역 데이터 저장소: 각 시트에서 파싱된 데이터 배열 --- */
let driversData = [];           // 드라이버 목록
let racesData = [];             // 레이스 목록
let resultsData = [];           // 레이스 결과
let constructorStandingsData = []; // 컨스트럭터 순위
let driverStandingsData = [];   // 드라이버 순위

/* 현재 선택된 시즌 연도 */
let selectedYear = null;

/* --- 국적별 국기 이모지 매핑: 국적 문자열 → 깃발 이모지 --- */
const NATIONALITY_FLAGS = {
    'British': '🇬🇧', 'German': '🇩🇪', 'Spanish': '🇪🇸', 'Finnish': '🇫🇮',
    'Brazilian': '🇧🇷', 'Australian': '🇦🇺', 'French': '🇫🇷', 'Italian': '🇮🇹',
    'Dutch': '🇳🇱', 'Mexican': '🇲🇽', 'Canadian': '🇨🇦', 'Japanese': '🇯🇵',
    'Austrian': '🇦🇹', 'Belgian': '🇧🇪', 'Swiss': '🇨🇭', 'Danish': '🇩🇰',
    'American': '🇺🇸', 'Polish': '🇵🇱', 'Colombian': '🇨🇴', 'Venezuelan': '🇻🇪',
    'Indian': '🇮🇳', 'Russian': '🇷🇺', 'Swedish': '🇸🇪', 'Thai': '🇹🇭',
    'Chinese': '🇨🇳', 'New Zealander': '🇳🇿', 'Malaysian': '🇲🇾',
    'Hungarian': '🇭🇺', 'Argentine': '🇦🇷', 'Portuguese': '🇵🇹',
    'Monegasque': '🇲🇨', 'Indonesian': '🇮🇩', 'South African': '🇿🇦',
    'Korean': '🇰🇷', 'Irish': '🇮🇪', 'Czech': '🇨🇿', 'Romanian': '🇷🇴',
};

/* --- 컨스트럭터 ID → 팀 이름 매핑 (Ergast 데이터베이스 기준) --- */
const CONSTRUCTOR_NAMES = {
    1: 'McLaren', 2: 'BMW Sauber', 3: 'Williams', 4: 'Renault',
    5: 'Toro Rosso', 6: 'Ferrari', 7: 'Toyota', 8: 'Super Aguri',
    9: 'Red Bull', 10: 'Force India', 11: 'Honda', 12: 'Spyker',
    13: 'MF1', 14: 'Brawn', 15: 'Lotus', 16: 'Virgin',
    17: 'HRT', 18: 'Sauber', 19: 'Caterham', 20: 'Lotus F1',
    21: 'Marussia', 22: 'Manor Marussia', 51: 'Haas',
    131: 'Mercedes', 210: 'Racing Point', 211: 'AlphaTauri',
    213: 'Alpine', 214: 'Aston Martin', 117: 'Alfa Romeo',
    215: 'RB', 216: 'Kick Sauber',
    /* 추가 매핑: 데이터에 없는 ID는 "Constructor #ID"로 표시 */
};

/* ===================================================================
   CSV 파싱 함수: CSV 텍스트 → 객체 배열로 변환
   - 따옴표 내 쉼표와 줄바꿈을 올바르게 처리
   - \N 값은 null로 변환
   =================================================================== */
function parseCSV(text) {
    /* 행 단위로 분리 (따옴표 내 줄바꿈 고려) */
    const rows = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (char === '"') {
            /* 따옴표 토글: 따옴표 안/밖 상태 전환 */
            if (inQuotes && text[i + 1] === '"') {
                current += '"'; // 이스케이프된 따옴표
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if ((char === '\n' || char === '\r') && !inQuotes) {
            /* 줄바꿈: 따옴표 밖이면 행 완료 */
            if (current.trim()) rows.push(current);
            current = '';
            if (char === '\r' && text[i + 1] === '\n') i++; // \r\n 처리
        } else {
            current += char;
        }
    }
    /* 마지막 행 추가 */
    if (current.trim()) rows.push(current);

    if (rows.length === 0) return [];

    /* 첫 행을 헤더로 사용 */
    const headers = splitCSVRow(rows[0]);

    /* 나머지 행을 객체로 변환 */
    return rows.slice(1).map(row => {
        const values = splitCSVRow(row);
        const obj = {};
        headers.forEach((header, index) => {
            let val = (values[index] || '').trim();
            /* \N 값은 null로 치환 (Ergast DB의 NULL 표기법) */
            if (val === '\\N') val = null;
            obj[header.trim()] = val;
        });
        return obj;
    });
}

/* --- CSV 행 하나를 필드 배열로 분리 (따옴표 내 쉼표 처리) --- */
function splitCSVRow(row) {
    const fields = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < row.length; i++) {
        const char = row[i];
        if (char === '"') {
            if (inQuotes && row[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            fields.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    fields.push(current);
    return fields;
}

/* ===================================================================
   데이터 가져오기: 모든 CSV 시트를 병렬로 fetch
   - 로딩 오버레이 표시 → 데이터 로드 → 오버레이 숨김
   =================================================================== */
async function fetchAllData() {
    try {
        /* 5개 시트를 동시에 가져오기 (Promise.all로 병렬 처리) */
        const [driversRes, racesRes, resultsRes, csRes, dsRes] = await Promise.all([
            fetch(URLS.drivers),
            fetch(URLS.races),
            fetch(URLS.results),
            fetch(URLS.constructorStandings),
            fetch(URLS.driverStandings),
        ]);

        /* 응답을 텍스트로 변환 */
        const [driversText, racesText, resultsText, csText, dsText] = await Promise.all([
            driversRes.text(),
            racesRes.text(),
            resultsRes.text(),
            csRes.text(),
            dsRes.text(),
        ]);

        /* CSV 텍스트를 객체 배열로 파싱 */
        driversData = parseCSV(driversText);
        racesData = parseCSV(racesText);
        resultsData = parseCSV(resultsText);
        constructorStandingsData = parseCSV(csText);
        driverStandingsData = parseCSV(dsText);

        console.log(`✅ 데이터 로드 완료: 드라이버 ${driversData.length}명, 레이스 ${racesData.length}개, 결과 ${resultsData.length}개`);

    } catch (error) {
        /* 데이터 로드 실패 시 에러 표시 */
        console.error('❌ 데이터 로드 실패:', error);
        document.querySelector('.main-content').innerHTML =
            '<div class="empty-state">데이터를 불러오는데 실패했습니다. 새로고침 해주세요.</div>';
    }
}

/* ===================================================================
   시즌(연도) 목록 추출 및 드롭다운 채우기
   - races 데이터에서 고유 연도를 추출하여 내림차순 정렬
   =================================================================== */
function populateSeasonFilter() {
    /* 레이스 데이터에서 연도만 추출하고 중복 제거 */
    const years = [...new Set(racesData.map(r => r.year))].filter(Boolean).sort((a, b) => b - a);

    const select = document.getElementById('season-select');
    select.innerHTML = '';

    /* 각 연도를 옵션으로 추가 */
    years.forEach(year => {
        const option = document.createElement('option');
        option.value = year;
        option.textContent = year;
        select.appendChild(option);
    });

    /* 기본값: 최신 연도 선택 */
    if (years.length > 0) {
        selectedYear = years[0];
        select.value = selectedYear;
    }

    /* 연도 변경 이벤트 리스너 등록 */
    select.addEventListener('change', (e) => {
        selectedYear = e.target.value;
        renderDashboard(); // 대시보드 전체 재렌더링
    });
}

/* ===================================================================
   헬퍼: 선택된 시즌의 마지막 레이스 ID 가져오기
   - 시즌 최종 순위를 결정하는 마지막 라운드의 raceId
   =================================================================== */
function getLastRaceIdForYear(year) {
    /* 해당 연도의 모든 레이스를 라운드 순으로 정렬 */
    const yearRaces = racesData
        .filter(r => r.year === String(year))
        .sort((a, b) => Number(b.round) - Number(a.round));

    /* 마지막 라운드의 raceId 반환 */
    return yearRaces.length > 0 ? yearRaces[0].raceId : null;
}

/* ===================================================================
   헬퍼: 드라이버 ID로 드라이버 정보 객체 가져오기
   =================================================================== */
function getDriverById(driverId) {
    return driversData.find(d => d.driverId === String(driverId));
}

/* ===================================================================
   헬퍼: 컨스트럭터 ID로 팀 이름 가져오기
   - CONSTRUCTOR_NAMES 매핑에 없으면 "Team #ID" 형태로 반환
   =================================================================== */
function getConstructorName(constructorId) {
    return CONSTRUCTOR_NAMES[Number(constructorId)] || `Team #${constructorId}`;
}

/* ===================================================================
   헬퍼: 특정 연도에 드라이버가 속한 팀 찾기
   - results 테이블에서 해당 연도의 가장 최근 레이스 결과를 참조
   =================================================================== */
function getDriverTeam(driverId, year) {
    /* 해당 연도의 raceId 목록 추출 */
    const yearRaceIds = new Set(
        racesData.filter(r => r.year === String(year)).map(r => r.raceId)
    );

    /* 해당 연도에서 이 드라이버의 결과 찾기 (마지막 경기 기준) */
    const driverResults = resultsData
        .filter(r => r.driverId === String(driverId) && yearRaceIds.has(r.raceId));

    if (driverResults.length > 0) {
        /* 가장 마지막 결과의 constructorId로 팀 이름 반환 */
        const lastResult = driverResults[driverResults.length - 1];
        return getConstructorName(lastResult.constructorId);
    }
    return 'Unknown';
}

/* ===================================================================
   상단 통계 카드 렌더링: 시즌 하이라이트
   - 최다 우승, 최다 포인트, 최다 폴 포지션 표시
   =================================================================== */
function renderStatsCards() {
    const grid = document.getElementById('stats-grid');
    const lastRaceId = getLastRaceIdForYear(selectedYear);

    if (!lastRaceId) {
        grid.innerHTML = '<div class="empty-state">해당 시즌 데이터가 없습니다.</div>';
        return;
    }

    /* --- 최다 우승 드라이버 찾기 --- */
    /* 해당 시즌 마지막 레이스 기준 드라이버 순위에서 wins가 가장 높은 드라이버 */
    const seasonDriverStandings = driverStandingsData
        .filter(ds => ds.raceId === lastRaceId)
        .sort((a, b) => Number(b.wins) - Number(a.wins));

    const topWinner = seasonDriverStandings[0];
    const topWinnerDriver = topWinner ? getDriverById(topWinner.driverId) : null;

    /* --- 최다 포인트 드라이버 찾기 --- */
    const topPoints = seasonDriverStandings
        .sort((a, b) => Number(b.points) - Number(a.points))[0];
    const topPointsDriver = topPoints ? getDriverById(topPoints.driverId) : null;

    /* --- 최다 폴 포지션 찾기 (grid=1인 결과 카운트) --- */
    const yearRaceIds = new Set(
        racesData.filter(r => r.year === String(selectedYear)).map(r => r.raceId)
    );

    /* 해당 시즌 모든 레이스에서 grid=1(폴 포지션)인 결과를 드라이버별로 집계 */
    const poleCounts = {};
    resultsData
        .filter(r => yearRaceIds.has(r.raceId) && r.grid === '1')
        .forEach(r => {
            poleCounts[r.driverId] = (poleCounts[r.driverId] || 0) + 1;
        });

    /* 폴 횟수 기준 내림차순 정렬하여 최다 폴 드라이버 찾기 */
    const topPoleId = Object.entries(poleCounts).sort((a, b) => b[1] - a[1])[0];
    const topPoleDriver = topPoleId ? getDriverById(topPoleId[0]) : null;
    const topPoleCount = topPoleId ? topPoleId[1] : 0;

    /* --- 총 레이스 수 --- */
    const totalRaces = yearRaceIds.size;

    /* --- 최다 우승 컨스트럭터 찾기 --- */
    const seasonCSData = constructorStandingsData
        .filter(cs => cs.raceId === lastRaceId)
        .sort((a, b) => Number(b.points) - Number(a.points));
    const topConstructor = seasonCSData[0];

    /* HTML 렌더링 */
    grid.innerHTML = `
        <!-- 최다 우승 통계 카드 -->
        <div class="stat-card">
            <div class="stat-icon">🏆</div>
            <div class="stat-label">MOST WINS</div>
            <div class="stat-value">${topWinnerDriver ? `${topWinnerDriver.forename} ${topWinnerDriver.surname}` : 'N/A'}</div>
            <div class="stat-detail">${topWinner ? topWinner.wins : 0} 승</div>
        </div>

        <!-- 최다 포인트 통계 카드 -->
        <div class="stat-card">
            <div class="stat-icon">⭐</div>
            <div class="stat-label">MOST POINTS</div>
            <div class="stat-value">${topPointsDriver ? `${topPointsDriver.forename} ${topPointsDriver.surname}` : 'N/A'}</div>
            <div class="stat-detail">${topPoints ? topPoints.points : 0} 포인트</div>
        </div>

        <!-- 최다 폴 포지션 통계 카드 -->
        <div class="stat-card">
            <div class="stat-icon">🏁</div>
            <div class="stat-label">MOST POLES</div>
            <div class="stat-value">${topPoleDriver ? `${topPoleDriver.forename} ${topPoleDriver.surname}` : 'N/A'}</div>
            <div class="stat-detail">${topPoleCount} 폴 포지션</div>
        </div>

        <!-- 총 레이스 수 통계 카드 -->
        <div class="stat-card">
            <div class="stat-icon">🏎️</div>
            <div class="stat-label">TOTAL RACES</div>
            <div class="stat-value">${totalRaces}</div>
            <div class="stat-detail">${selectedYear} 시즌</div>
        </div>

        <!-- 최다 포인트 컨스트럭터 통계 카드 -->
        <div class="stat-card">
            <div class="stat-icon">🔧</div>
            <div class="stat-label">TOP CONSTRUCTOR</div>
            <div class="stat-value">${topConstructor ? getConstructorName(topConstructor.constructorId) : 'N/A'}</div>
            <div class="stat-detail">${topConstructor ? topConstructor.points : 0} 포인트</div>
        </div>
    `;
}

/* ===================================================================
   드라이버 카드 렌더링: 시즌별 드라이버 프로필 카드
   - 국기, 이름, 코드, 팀, 포인트 표시
   =================================================================== */
function renderDriverCards() {
    const grid = document.getElementById('drivers-grid');
    const lastRaceId = getLastRaceIdForYear(selectedYear);

    if (!lastRaceId) {
        grid.innerHTML = '<div class="empty-state">해당 시즌 데이터가 없습니다.</div>';
        return;
    }

    /* 해당 시즌 마지막 레이스 기준 드라이버 순위를 포인트 내림차순 정렬 */
    const standings = driverStandingsData
        .filter(ds => ds.raceId === lastRaceId)
        .sort((a, b) => Number(b.points) - Number(a.points));

    /* 각 드라이버별 카드 HTML 생성 */
    const cardsHTML = standings.map((standing, index) => {
        const driver = getDriverById(standing.driverId);
        if (!driver) return '';

        /* 국적에 해당하는 깃발 이모지 (없으면 기본 깃발) */
        const flag = NATIONALITY_FLAGS[driver.nationality] || '🏳️';
        /* 해당 시즌에서의 팀 이름 */
        const team = getDriverTeam(standing.driverId, selectedYear);
        /* 드라이버 코드 (예: HAM, VER) */
        const code = driver.code || driver.driverRef?.toUpperCase().slice(0, 3) || '???';

        return `
            <div class="driver-card" style="animation-delay: ${index * 0.05}s">
                <div class="driver-card-header">
                    <!-- 국적 깃발 -->
                    <span class="driver-flag">${flag}</span>
                    <div class="driver-name-group">
                        <!-- 드라이버 전체 이름 -->
                        <div class="driver-name">${driver.forename} ${driver.surname}</div>
                        <!-- 드라이버 코드 -->
                        <div class="driver-code">${code}</div>
                    </div>
                </div>
                <div class="driver-card-footer">
                    <!-- 소속 팀 -->
                    <span class="driver-team">${team}</span>
                    <!-- 시즌 포인트 -->
                    <span class="driver-points">${standing.points} PTS</span>
                </div>
            </div>
        `;
    }).join('');

    grid.innerHTML = cardsHTML || '<div class="empty-state">드라이버 데이터가 없습니다.</div>';
}

/* ===================================================================
   드라이버 순위 테이블 렌더링
   - 순위, 이름, 국적, 팀, 승수, 포인트 열 표시
   =================================================================== */
function renderDriverStandings() {
    const tbody = document.getElementById('driver-standings-body');
    const lastRaceId = getLastRaceIdForYear(selectedYear);

    if (!lastRaceId) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state">해당 시즌 데이터가 없습니다.</td></tr>';
        return;
    }

    /* 포지션 기준 오름차순 정렬 (1위부터) */
    const standings = driverStandingsData
        .filter(ds => ds.raceId === lastRaceId)
        .sort((a, b) => Number(a.position) - Number(b.position));

    /* 각 행 HTML 생성 */
    const rowsHTML = standings.map(standing => {
        const driver = getDriverById(standing.driverId);
        if (!driver) return '';

        const flag = NATIONALITY_FLAGS[driver.nationality] || '🏳️';
        const team = getDriverTeam(standing.driverId, selectedYear);
        const pos = Number(standing.position);

        /* 순위별 CSS 클래스 (1~3위 특별 스타일) */
        const posClass = pos <= 3 ? `position-${pos}` : '';

        return `
            <tr>
                <td class="position-cell ${posClass}">${pos}</td>
                <td class="name-cell">${flag} ${driver.forename} ${driver.surname}</td>
                <td>${driver.nationality || '-'}</td>
                <td>${team}</td>
                <td class="wins-cell">${standing.wins}</td>
                <td class="points-cell">${standing.points}</td>
            </tr>
        `;
    }).join('');

    tbody.innerHTML = rowsHTML || '<tr><td colspan="6" class="empty-state">데이터 없음</td></tr>';
}

/* ===================================================================
   컨스트럭터 순위 테이블 렌더링
   - 순위, 팀명, 승수, 포인트 표시
   =================================================================== */
function renderConstructorStandings() {
    const tbody = document.getElementById('constructor-standings-body');
    const lastRaceId = getLastRaceIdForYear(selectedYear);

    if (!lastRaceId) {
        tbody.innerHTML = '<tr><td colspan="4" class="empty-state">해당 시즌 데이터가 없습니다.</td></tr>';
        return;
    }

    /* 포지션 기준 오름차순 정렬 */
    const standings = constructorStandingsData
        .filter(cs => cs.raceId === lastRaceId)
        .sort((a, b) => Number(a.position) - Number(b.position));

    /* 각 행 HTML 생성 */
    const rowsHTML = standings.map(standing => {
        const pos = Number(standing.position);
        const posClass = pos <= 3 ? `position-${pos}` : '';
        const name = getConstructorName(standing.constructorId);

        return `
            <tr>
                <td class="position-cell ${posClass}">${pos}</td>
                <td class="name-cell">${name}</td>
                <td class="wins-cell">${standing.wins}</td>
                <td class="points-cell">${standing.points}</td>
            </tr>
        `;
    }).join('');

    tbody.innerHTML = rowsHTML || '<tr><td colspan="4" class="empty-state">데이터 없음</td></tr>';
}

/* ===================================================================
   대시보드 전체 렌더링: 모든 섹션을 업데이트
   - 시즌 변경 시 호출됨
   =================================================================== */
function renderDashboard() {
    renderStatsCards();           // 상단 통계 카드
    renderDriverCards();          // 드라이버 프로필 카드
    renderDriverStandings();      // 드라이버 순위 테이블
    renderConstructorStandings(); // 컨스트럭터 순위 테이블
}

/* ===================================================================
   로딩 오버레이 숨기기: 부드러운 페이드아웃 효과
   =================================================================== */
function hideLoadingOverlay() {
    const overlay = document.getElementById('loading-overlay');
    overlay.classList.add('hidden');
}

/* ===================================================================
   앱 초기화: 페이지 로드 시 데이터 가져오고 대시보드 렌더링
   =================================================================== */
async function initApp() {
    /* 1단계: 모든 CSV 데이터 동시 가져오기 */
    await fetchAllData();

    /* 2단계: 시즌 필터 드롭다운 채우기 */
    populateSeasonFilter();

    /* 3단계: 대시보드 전체 렌더링 */
    renderDashboard();

    /* 4단계: 로딩 오버레이 숨기기 (약간 딜레이로 자연스러운 전환) */
    setTimeout(hideLoadingOverlay, 500);
}

/* --- 페이지 로드 완료 시 앱 시작 --- */
document.addEventListener('DOMContentLoaded', initApp);
