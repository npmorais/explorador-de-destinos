const API_URL = 'https://jsonplaceholder.typicode.com/posts';
const STORAGE_KEY = 'explorador-favoritos';
const THEME_KEY = 'explorador-tema';
function must(el, name) {
    if (!el) {
        throw new Error(`Elemento não encontrado: ${name}`);
    }
    return el;
}
function el(tag, className, text) {
    const element = document.createElement(tag);
    if (className)
        element.className = className;
    if (text)
        element.textContent = text;
    return element;
}
function formatDate(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}
function createNotificationService() {
    let currentNotification = null;
    function show(message, timeout = 3000) {
        if (currentNotification) {
            currentNotification.remove();
            currentNotification = null;
        }
        const notification = el('div', 'notification', message);
        notification.setAttribute('role', 'status');
        notification.setAttribute('aria-live', 'polite');
        document.body.appendChild(notification);
        currentNotification = notification;
        setTimeout(() => {
            notification.classList.add('fade-out');
            setTimeout(() => {
                if (currentNotification === notification) {
                    currentNotification = null;
                }
                notification.remove();
            }, 300);
        }, timeout);
    }
    return { show };
}
function createThemeService(themeKey) {
    const listeners = new Set();
    function getSystemTheme() {
        return window.matchMedia?.('(prefers-color-scheme: dark)').matches
            ? 'dark'
            : 'light';
    }
    function getSavedTheme() {
        const savedTheme = localStorage.getItem(themeKey);
        return savedTheme === 'dark' || savedTheme === 'light' ? savedTheme : null;
    }
    let currentTheme = getSavedTheme() ?? getSystemTheme();
    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
    }
    function setTheme(theme) {
        currentTheme = theme;
        localStorage.setItem(themeKey, theme);
        applyTheme(theme);
        listeners.forEach(listener => listener(theme));
    }
    function toggleTheme() {
        setTheme(currentTheme === 'dark' ? 'light' : 'dark');
    }
    function onChange(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
    }
    const systemMql = window.matchMedia?.('(prefers-color-scheme: dark)');
    systemMql?.addEventListener('change', () => {
        if (!getSavedTheme()) {
            setTheme(getSystemTheme());
        }
    });
    applyTheme(currentTheme);
    return {
        getCurrent: () => currentTheme,
        toggle: toggleTheme,
        onChange
    };
}
function createApiService(baseUrl) {
    let controller = null;
    const postFetchedListeners = new Set();
    const errorListeners = new Set();
    function emitPost(post) {
        postFetchedListeners.forEach(listener => listener(post));
    }
    function emitError(message, error) {
        errorListeners.forEach(listener => listener(message, error));
    }
    async function fetchRandomPost() {
        try {
            if (controller) {
                controller.abort();
            }
            controller = new AbortController();
            const randomId = Math.floor(Math.random() * 100) + 1;
            const response = await fetch(`${baseUrl}/${randomId}`, {
                signal: controller.signal,
                headers: {
                    'Accept': 'application/json'
                }
            });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const post = await response.json();
            emitPost(post);
        }
        catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
                return;
            }
            const err = error instanceof Error
                ? error
                : new Error(String(error));
            emitError('Erro ao buscar postagem', err);
        }
    }
    function cancel() {
        controller?.abort();
    }
    function onPostFetched(listener) {
        postFetchedListeners.add(listener);
        return () => postFetchedListeners.delete(listener);
    }
    function onError(listener) {
        errorListeners.add(listener);
        return () => errorListeners.delete(listener);
    }
    return {
        fetchRandomPost,
        cancel,
        onPostFetched,
        onError
    };
}
function createFavoritesService(storageKey) {
    const listeners = new Set();
    function getFavorites() {
        try {
            const stored = localStorage.getItem(storageKey);
            return stored ? JSON.parse(stored) : [];
        }
        catch (error) {
            console.error('Erro ao ler favoritos:', error);
            return [];
        }
    }
    function writeFavorites(favorites) {
        try {
            localStorage.setItem(storageKey, JSON.stringify(favorites));
            listeners.forEach(listener => listener(favorites));
        }
        catch (error) {
            console.error('Erro ao salvar favoritos:', error);
        }
    }
    function addFavorite(post) {
        const favorites = getFavorites();
        const alreadyExists = favorites.some(fav => fav.id === post.id);
        if (alreadyExists) {
            return false;
        }
        const newFavorite = {
            id: post.id,
            title: post.title,
            timestamp: Date.now()
        };
        favorites.unshift(newFavorite);
        writeFavorites(favorites);
        return true;
    }
    function removeFavorite(id) {
        const favorites = getFavorites();
        const filtered = favorites.filter(fav => fav.id !== id);
        writeFavorites(filtered);
    }
    function clearAllFavorites() {
        writeFavorites([]);
    }
    function onChange(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
    }
    return {
        getFavorites,
        addFavorite,
        removeFavorite,
        clearAllFavorites,
        onChange
    };
}
function createGeoService() {
    function requestLocation(options, callbacks) {
        if (!navigator.geolocation) {
            callbacks?.onError('Seu navegador não suporta geolocalização');
            return;
        }
        callbacks?.onLoading?.();
        navigator.geolocation.getCurrentPosition((position) => {
            const coords = {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude
            };
            callbacks?.onSuccess(coords);
        }, (error) => {
            let errorMessage = 'Erro ao obter localização';
            switch (error.code) {
                case error.PERMISSION_DENIED:
                    errorMessage = 'Permissão negada. Por favor, permita o acesso à localização.';
                    break;
                case error.POSITION_UNAVAILABLE:
                    errorMessage = 'Localização indisponível.';
                    break;
                case error.TIMEOUT:
                    errorMessage = 'Tempo esgotado ao buscar localização.';
                    break;
            }
            callbacks?.onError(errorMessage);
        }, {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0,
            ...options
        });
    }
    return { requestLocation };
}
function createApp() {
    const apiService = createApiService(API_URL);
    const favoritesService = createFavoritesService(STORAGE_KEY);
    const themeService = createThemeService(THEME_KEY);
    const geoService = createGeoService();
    const notificationService = createNotificationService();
    const postTitle = must(document.getElementById('post-title'), 'post-title');
    const postId = must(document.getElementById('post-id'), 'post-id');
    const fetchPostBtn = must(document.getElementById('fetch-post-btn'), 'fetch-post-btn');
    const saveFavoriteBtn = must(document.getElementById('save-favorite-btn'), 'save-favorite-btn');
    const favoritesList = must(document.getElementById('favorites-list'), 'favorites-list');
    const clearFavoritesBtn = must(document.getElementById('clear-favorites-btn'), 'clear-favorites-btn');
    const locationInfo = must(document.getElementById('location-info'), 'location-info');
    const getLocationBtn = must(document.getElementById('get-location-btn'), 'get-location-btn');
    const themeToggle = must(document.getElementById('theme-toggle'), 'theme-toggle');
    let currentPost = null;
    function displayPost(post) {
        postTitle.textContent = post.title;
        postId.textContent = `#${post.id}`;
    }
    function displayFavorites(favorites) {
        favoritesList.innerHTML = '';
        if (favorites.length === 0) {
            favoritesList.appendChild(el('p', 'empty-state', 'Nenhum favorito salvo ainda'));
            clearFavoritesBtn.style.display = 'none';
            return;
        }
        clearFavoritesBtn.style.display = 'block';
        favorites.forEach(fav => {
            const item = el('div', 'favorite-item');
            item.dataset.id = fav.id.toString();
            const content = el('div', 'favorite-content');
            content.appendChild(el('span', 'favorite-id', `#${fav.id}`));
            content.appendChild(el('p', 'favorite-title', fav.title));
            content.appendChild(el('span', 'favorite-date', formatDate(fav.timestamp)));
            const removeBtn = el('button', 'btn-remove', '❌');
            removeBtn.title = 'Remover favorito';
            removeBtn.setAttribute('aria-label', `Remover favorito ${fav.title}`);
            removeBtn.addEventListener('click', () => {
                favoritesService.removeFavorite(fav.id);
                notificationService.show('Favorito removido! 🗑️');
            });
            item.appendChild(content);
            item.appendChild(removeBtn);
            favoritesList.appendChild(item);
        });
    }
    function displayLocation(coords) {
        const locationData = el('div', 'location-data');
        const latP = el('p');
        latP.innerHTML = '<strong>Latitude:</strong> ' + coords.latitude.toFixed(6) + '°';
        const lngP = el('p');
        lngP.innerHTML = '<strong>Longitude:</strong> ' + coords.longitude.toFixed(6) + '°';
        locationData.appendChild(latP);
        locationData.appendChild(lngP);
        locationData.appendChild(el('p', 'location-success', '✅ Localização obtida com sucesso!'));
        locationInfo.innerHTML = '';
        locationInfo.appendChild(locationData);
    }
    function displayLocationError(message) {
        locationInfo.innerHTML = `<p class="error">❌ ${message}</p>`;
    }
    function displayLocationLoading() {
        locationInfo.innerHTML = '<p class="loading">🔍 Buscando sua localização...</p>';
    }
    function setLoadingState(isLoading) {
        if (isLoading) {
            postTitle.textContent = 'Buscando novo destino...';
            postId.textContent = '';
            fetchPostBtn.disabled = true;
            saveFavoriteBtn.disabled = true;
        }
        else {
            fetchPostBtn.disabled = false;
            saveFavoriteBtn.disabled = false;
        }
    }
    function onPostFetched(post) {
        currentPost = post;
        displayPost(post);
        setLoadingState(false);
    }
    function onPostFetchError(message, error) {
        console.error(message, error);
        postTitle.textContent = 'Erro ao carregar destino. Tente novamente.';
        setLoadingState(false);
        saveFavoriteBtn.disabled = true;
    }
    function onFetchPost() {
        setLoadingState(true);
        apiService.fetchRandomPost();
    }
    function onSaveFavorite() {
        if (!currentPost)
            return;
        const success = favoritesService.addFavorite(currentPost);
        if (success) {
            notificationService.show('Destino salvo nos favoritos! ⭐');
        }
        else {
            notificationService.show('Este destino já está nos favoritos! 💫');
        }
    }
    function onClearFavorites() {
        if (confirm('Tem certeza que deseja remover todos os favoritos?')) {
            favoritesService.clearAllFavorites();
            notificationService.show('Todos os favoritos foram removidos! 🗑️');
        }
    }
    function onGetLocation() {
        displayLocationLoading();
        getLocationBtn.disabled = true;
        geoService.requestLocation({}, {
            onSuccess: (coords) => {
                displayLocation(coords);
                getLocationBtn.disabled = false;
            },
            onError: (message) => {
                displayLocationError(message);
                getLocationBtn.disabled = false;
            }
        });
    }
    function onToggleTheme() {
        themeService.toggle();
        const themeNames = {
            'dark': 'Modo Escuro',
            'light': 'Modo Claro'
        };
        const currentTheme = themeService.getCurrent();
        const icon = currentTheme === 'dark' ? '🌙' : '☀️';
        notificationService.show(`${themeNames[currentTheme]} ativado! ${icon}`);
    }
    apiService.onPostFetched(onPostFetched);
    apiService.onError(onPostFetchError);
    favoritesService.onChange(displayFavorites);
    fetchPostBtn.addEventListener('click', onFetchPost);
    saveFavoriteBtn.addEventListener('click', onSaveFavorite);
    clearFavoritesBtn.addEventListener('click', onClearFavorites);
    getLocationBtn.addEventListener('click', onGetLocation);
    themeToggle.addEventListener('click', onToggleTheme);
    function init() {
        apiService.fetchRandomPost();
        displayFavorites(favoritesService.getFavorites());
        onGetLocation();
    }
    return { init };
}
const app = createApp();
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', app.init);
}
else {
    app.init();
}
export {};
