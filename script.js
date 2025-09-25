const apiKey = "4ac0ac9df419a582a4ab82870ac7e79e";
function setIcon(imgEl, iconCode, altText) {
  if (!iconCode || !imgEl) { imgEl.removeAttribute("src"); imgEl.alt = "No icon"; return; }
  const primary = `https://openweathermap.org/img/wn/${iconCode}@2x.png`;
  const fallback = `https://openweathermap.org/img/wn/${iconCode}.png`;
  imgEl.alt = altText || "Weather Icon";
  imgEl.onerror = () => { if (imgEl.src !== fallback) imgEl.src = fallback; };
  imgEl.src = primary;
}
function cityLocalDate(timezoneSeconds) {
  const browserOffsetSec = new Date().getTimezoneOffset() * 60; // negative for GMT+
  return new Date(Date.now() + (timezoneSeconds + browserOffsetSec) * 1000);
}
async function geocode(query) {
  const url = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(query)}&limit=1&appid=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Geocoding failed");
  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) throw new Error("Place not found");
  const { name, state, country, lat, lon } = data[0];
  return { display: [name, state, country].filter(Boolean).join(", "), lat, lon };
}
function humanizeFileTitle(input) {
  if (!input) return null;
  try {
    if (/^https?:\/\//.test(input)) {
      const last = decodeURIComponent(new URL(input).pathname.split("/").pop() || "");
      const m = last.match(/(?:\d+px-)?(.+?)\.(jpg|jpeg|png|webp|gif|tif|tiff|svg)/i);
      if (m) return m[1].replace(/_/g, " ").replace(/-/g, " ").trim();
    }
  } catch(_) {}
  
  return input.replace(/^File:/i, "").replace(/\.[^.]+$/, "").replace(/_/g, " ").replace(/-/g, " ").trim();
}
async function fetchPlaceMedia(query) {
  try {
    const url = `https://en.wikipedia.org/w/api.php?origin=*&action=query&format=json&formatversion=2` +
      `&prop=pageimages&piprop=thumbnail&pilicense=any&pithumbsize=1600&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrlimit=1`;
    const res = await fetch(url);
    if (res.ok) {
      const j = await res.json();
      if (j.query && j.query.pages && j.query.pages.length) {
        const p = j.query.pages[0];
        const imageUrl = p.thumbnail && p.thumbnail.source;
        const fileTitle = p.pageimage ? humanizeFileTitle(p.pageimage) : null; // e.g., "Taj Mahal ..."
        if (imageUrl) return { url: imageUrl, pictureName: fileTitle || p.title || null };
      }
    }
  } catch (_) {}
  try {
    const res2 = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`);
    if (res2.ok) {
      const j2 = await res2.json();
      const url = (j2.originalimage && j2.originalimage.source) ||
                  (j2.thumbnail && (j2.thumbnail.source || j2.thumbnail.url));
      const derived = humanizeFileTitle(url);
      if (url) return { url, pictureName: derived || j2.title || null };
    }
  } catch (_) {}

  return { url: null, pictureName: null };
}

async function getWeatherByCoords(lat, lon, label) {
  const currentUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`;
  const currentResp = await fetch(currentUrl);
  if (!currentResp.ok) throw new Error("Weather not available");
  const currentData = await currentResp.json();

  document.getElementById("cityName").innerText = label || currentData.name || "Location";
  document.getElementById("temperature").innerText = `Temperature: ${currentData.main.temp.toFixed(1)} °C`;
  document.getElementById("description").innerText = `Weather: ${currentData.weather[0].description}`;
  document.getElementById("humidity").innerText = `Humidity: ${currentData.main.humidity} %`;
  document.getElementById("wind").innerText = `Wind Speed: ${currentData.wind.speed} m/s`;
  setIcon(document.getElementById("weatherIcon"), currentData.weather[0].icon, currentData.weather[0].main);

  const localDate = cityLocalDate(currentData.timezone);
  document.getElementById("localTime").innerText =
    `Local Time: ${localDate.toLocaleString('en-GB', { weekday:'short', day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })}`;

  const condition = currentData.weather[0].main.toLowerCase();
  let tip = "🌍 Have a nice day!";
  if (condition.includes("rain")) tip = "🌧 Carry an umbrella!";
  else if (condition.includes("clear")) tip = "☀ Great day for outdoor activities!";
  else if (condition.includes("cloud")) tip = "☁ Might stay gloomy today.";
  else if (condition.includes("snow")) tip = "❄ Dress warmly, snow outside!";
  document.getElementById("weatherTip").innerText = tip;

  document.body.className = "";
  if (condition.includes("clear")) document.body.classList.add("sunny");
  else if (condition.includes("cloud")) document.body.classList.add("cloudy");
  else if (condition.includes("rain") || condition.includes("snow")) document.body.classList.add("rainy");
  else document.body.classList.add("night");
  const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`;
  const forecastResp = await fetch(forecastUrl);
  if (!forecastResp.ok) throw new Error("Forecast unavailable");
  const forecastData = await forecastResp.json();

  const list = forecastData.list || [];
  const byNoon = list.filter(it => it.dt_txt && it.dt_txt.includes("12:00:00"));
  const pick = byNoon.length ? byNoon : list.filter((_, i) => i % 8 === 0);
  const days = pick.slice(0, 5);

  const container = document.getElementById("forecastContainer");
  container.innerHTML = "";
  days.forEach(f => {
    const date = new Date(f.dt * 1000);
    const day = date.toLocaleDateString('en-US', { weekday: 'short' });

    const card = document.createElement("div");
    card.className = "forecast-card";
    card.innerHTML = `
      <p>${day}</p>
      <img alt="${f.weather[0].main}">
      <p>${f.main.temp.toFixed(1)} °C</p>
      <p>${f.weather[0].main}</p>
    `;
    setIcon(card.querySelector("img"), f.weather[0].icon, f.weather[0].main);
    container.appendChild(card);
  });

  document.getElementById("results").style.display = "block";
}

async function handleSearch() {
  const q = document.getElementById("cityInput").value.trim();
  if (!q) return alert("Please type a place name");
  try {
    
    document.getElementById("results").style.display = "none";
    document.getElementById("photoWrap").style.display = "none";

    const place = await geocode(q);
    const media = await fetchPlaceMedia(place.display);

    const wrap = document.getElementById("photoWrap");
    const imgEl = document.getElementById("placePhoto");
    const placeEl = document.getElementById("photoPlace");
    const titleEl = document.getElementById("photoTitle");

    if (media.url) {
      imgEl.src = media.url;
      imgEl.alt = `Photo of ${place.display}`;
      placeEl.textContent = place.display;                 
      titleEl.textContent = media.pictureName
        ? `Photo: ${media.pictureName}`                    
        : "";                                            
      wrap.style.display = "block";
    } else {
      wrap.style.display = "none";
    }

    
    await getWeatherByCoords(place.lat, place.lon, place.display);
  } catch (e) {
    alert(e.message);
    console.error(e);
  }
}

document.getElementById("searchBtn").addEventListener("click", handleSearch);
document.getElementById("cityInput").addEventListener("keyup", (e) => {
  if (e.key === "Enter") handleSearch();
});
