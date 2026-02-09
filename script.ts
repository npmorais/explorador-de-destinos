interface Post {
    userId: number;
    id: number;
    title: string;
    body: string;
}

interface Favorite {
    id: number;
    title: string;
    timestamp: number;
}

interface Coordinates {
    latitude: number;
    longitude: number;
}

type Theme = 'light' | 'dark';

const API_URL = 'https://jsonplaceholder.typicode.com/posts';
const STORAGE_KEY = 'explorador-favoritos';
const THEME_KEY = 'explorador-tema';

function must<T>(el: T | null, name: string): T {
    if (!el) {
        throw new Error(`Elemento não encontrado: ${name}`);
    }
    return el;
}

function el<K extends keyof HTMLElementTagNameMap>(
    tag: K, 
    className?: string, 
    text?: string
): HTMLElementTagNameMap[K] {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
}

function formatDate(timestamp: number): string {
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
    let currentNotification: HTMLDivElement | null = null;

    function show(message: string, timeout: number = 3000): void {
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

function createThemeService(themeKey: string) {
    const listeners = new Set<(theme: Theme) => void>();

    function getSystemTheme(): Theme {
        return window.matchMedia?.('(prefers-color-scheme: dark)').matches 
            ? 'dark' 
            : 'light';
    }

    function getSavedTheme(): Theme | null {
        const savedTheme = localStorage.getItem(themeKey) as Theme | null;
        return savedTheme === 'dark' || savedTheme === 'light' ? savedTheme : null;
    }
    
    let currentTheme: Theme = getSavedTheme() ?? getSystemTheme();

    function applyTheme(theme: Theme): void {
        document.documentElement.setAttribute('data-theme', theme);
    }

    function setTheme(theme: Theme): void {
        currentTheme = theme;
        localStorage.setItem(themeKey, theme);
        applyTheme(theme);
        listeners.forEach(listener => listener(theme));
    }

    function toggleTheme(): void {
        setTheme(currentTheme === 'dark' ? 'light' : 'dark');
    }

    function onChange(listener: (theme: Theme) => void) {
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

function createApiService(baseUrl: string) {
    let controller: AbortController | null = null;
    const postFetchedListeners = new Set<(post: Post) => void>();
    const errorListeners = new Set<(message: string, error: Error) => void>();

    function emitPost(post: Post) {
        postFetchedListeners.forEach(listener => listener(post));
    }

    function emitError(message: string, error: Error) {
        errorListeners.forEach(listener => listener(message, error));
    }

    async function fetchRandomPost(): Promise<void> {
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

            const post: Post = await response.json();
            emitPost(post);

        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
                return;
            }
            
            const err = error instanceof Error 
                ? error 
                : new Error(String(error));
            emitError('Erro ao buscar postagem', err);
        }
    }

    function cancel(): void {
        controller?.abort();
    }

    function onPostFetched(listener: (post: Post) => void) {
        postFetchedListeners.add(listener);
        return () => postFetchedListeners.delete(listener);
    }

    function onError(listener: (message: string, error: Error) => void) {
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

function createFavoritesService(storageKey: string) {
    const listeners = new Set<(favorites: Favorite[]) => void>();

    function getFavorites(): Favorite[] {
        try {
            const stored = localStorage.getItem(storageKey);
            return stored ? JSON.parse(stored) : [];
        } catch (error) {
            console.error('Erro ao ler favoritos:', error);
            return [];
        }
    }

    function writeFavorites(favorites: Favorite[]): void {
        try {
            localStorage.setItem(storageKey, JSON.stringify(favorites));
            listeners.forEach(listener => listener(favorites));
        } catch (error) {
            console.error('Erro ao salvar favoritos:', error);
        }
    }

    function addFavorite(post: Post): boolean {
        const favorites = getFavorites();
        const alreadyExists = favorites.some(fav => fav.id === post.id);

        if (alreadyExists) {
            return false;
        }

        const newFavorite: Favorite = {
            id: post.id,
            title: post.title,
            timestamp: Date.now()
        };

        favorites.unshift(newFavorite);
        writeFavorites(favorites);
        return true;
    }
    
    function removeFavorite(id: number): void {
        const favorites = getFavorites();
        const filtered = favorites.filter(fav => fav.id !== id);
        writeFavorites(filtered);
    }

    function clearAllFavorites(): void {
        writeFavorites([]);
    }

    function onChange(listener: (favorites: Favorite[]) => void) {
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
    type Callbacks = {
        onSuccess: (coords: Coordinates) => void;
        onError: (message: string) => void;
        onLoading?: () => void;
    }

    function requestLocation(options?: PositionOptions, callbacks?: Callbacks): void {
        if (!navigator.geolocation) {
            callbacks?.onError('Seu navegador não suporta geolocalização');
            return;
        }

        callbacks?.onLoading?.();

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const coords: Coordinates = {
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude
                };
                callbacks?.onSuccess(coords);
            },
            (error) => {
                let errorMessage = 'Erro ao obter localização';
                
                switch(error.code) {
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
            },
            { 
                enableHighAccuracy: true, 
                timeout: 10000, 
                maximumAge: 0, 
                ...options 
            }
        );
    }

    return { requestLocation };
}

function createApp() {
    const apiService = createApiService(API_URL);
    const favoritesService = createFavoritesService(STORAGE_KEY);
    const themeService = createThemeService(THEME_KEY);
    const geoService = createGeoService();
    const notificationService = createNotificationService();

    const postTitle = must(document.getElementById('post-title') as HTMLHeadingElement, 'post-title');
    const postId = must(document.getElementById('post-id') as HTMLSpanElement, 'post-id');
    const fetchPostBtn = must(document.getElementById('fetch-post-btn') as HTMLButtonElement, 'fetch-post-btn');
    const saveFavoriteBtn = must(document.getElementById('save-favorite-btn') as HTMLButtonElement, 'save-favorite-btn');
    const favoritesList = must(document.getElementById('favorites-list') as HTMLDivElement, 'favorites-list');
    const clearFavoritesBtn = must(document.getElementById('clear-favorites-btn') as HTMLButtonElement, 'clear-favorites-btn');
    const locationInfo = must(document.getElementById('location-info') as HTMLDivElement, 'location-info');
    const getLocationBtn = must(document.getElementById('get-location-btn') as HTMLButtonElement, 'get-location-btn');
    const themeToggle = must(document.getElementById('theme-toggle') as HTMLButtonElement, 'theme-toggle');
    
    let currentPost: Post | null = null;

    function displayPost(post: Post): void {
        postTitle.textContent = post.title;
        postId.textContent = `#${post.id}`;
    }

    function displayFavorites(favorites: Favorite[]): void {
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
    
    function displayLocation(coords: Coordinates): void {
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

    function displayLocationError(message: string): void {
        locationInfo.innerHTML = `<p class="error">❌ ${message}</p>`;
    }

    function displayLocationLoading(): void {
        locationInfo.innerHTML = '<p class="loading">🔍 Buscando sua localização...</p>';
    }

    function setLoadingState(isLoading: boolean): void {
        if (isLoading) {
            postTitle.textContent = 'Buscando novo destino...';
            postId.textContent = '';
            fetchPostBtn.disabled = true;
            saveFavoriteBtn.disabled = true;
        } else {
            fetchPostBtn.disabled = false;
            saveFavoriteBtn.disabled = false;
        }
    }

    function onPostFetched(post: Post): void {
        currentPost = post;
        displayPost(post);
        setLoadingState(false);
    }

    function onPostFetchError(message: string, error: Error): void {
        console.error(message, error);
        postTitle.textContent = 'Erro ao carregar destino. Tente novamente.';
        setLoadingState(false);
        saveFavoriteBtn.disabled = true;
    }

    function onFetchPost(): void {
        setLoadingState(true);
        apiService.fetchRandomPost();
    }

    function onSaveFavorite(): void {
        if (!currentPost) return;

        const success = favoritesService.addFavorite(currentPost);
        if (success) {
            notificationService.show('Destino salvo nos favoritos! ⭐');
        } else {
            notificationService.show('Este destino já está nos favoritos! 💫');
        }
    }

    function onClearFavorites(): void {
        if (confirm('Tem certeza que deseja remover todos os favoritos?')) {
            favoritesService.clearAllFavorites();
            notificationService.show('Todos os favoritos foram removidos! 🗑️');
        }
    }

    function onGetLocation(): void {
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

    function onToggleTheme(): void {
        themeService.toggle();
        const themeNames: Record<Theme, string> = { 
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
} else {
    app.init();
}