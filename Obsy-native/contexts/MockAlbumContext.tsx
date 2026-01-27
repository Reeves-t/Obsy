import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { Photo } from '@/types/albums';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface MockAlbumContextType {
    // Map of albumId -> Set of unseen photoIds
    unseenPhotos: Map<string, Set<string>>;
    // Array of mock photos (for Public album)
    mockPhotos: Photo[];
    // Mark a specific photo as seen
    markPhotoAsSeen: (albumId: string, photoId: string) => void;
    // Get count of unseen photos (optionally for a specific album)
    getUnseenPhotoCount: (albumId?: string) => number;
    // Check if an album has any unseen photos
    hasUnseenPhotos: (albumId: string) => boolean;
    // Legacy support: check if any album has unseen content
    unseenAlbums: { [albumId: string]: boolean };
    // Legacy support: mark entire album as seen
    markAlbumAsSeen: (albumId: string) => void;
    // Mark the tutorial as shared
    setHasSharedPublicImage: (value: boolean) => void;
}

const MockAlbumContext = createContext<MockAlbumContextType | undefined>(undefined);

// Create the intro photo for Public album
const createIntroPhoto = (): Photo => ({
    id: 'albums-intro-photo',
    albumId: 'public',
    uri: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?q=80&w=1000&auto=format&fit=crop', // Sleek dark aesthetic
    user: 'Obsy',
    mood: 'welcome',
    time: 'Now',
    created_at: new Date().toISOString(),
    isSeen: false,
    isMock: true,
    isIntro: true
});

export const MockAlbumProvider = ({ children }: { children: ReactNode }) => {
    // Track if user has ever shared to a public album
    const [hasSharedPublicImage, setHasSharedPublicImageState] = useState<boolean>(true); // Default to true while loading
    const [isLoaded, setIsLoaded] = useState(false);

    // Track unseen photos per album: Map<albumId, Set<photoId>>
    const [unseenPhotos, setUnseenPhotos] = useState<Map<string, Set<string>>>(new Map());

    // Load persistence on mount
    useEffect(() => {
        const loadState = async () => {
            try {
                const shared = await AsyncStorage.getItem('has_shared_public_image');
                const hasShared = shared === 'true';
                setHasSharedPublicImageState(hasShared);

                if (!hasShared) {
                    setUnseenPhotos(new Map([['public', new Set(['albums-intro-photo'])]]));
                }
                setIsLoaded(true);
            } catch (e) {
                console.error('Failed to load mock album state', e);
                setIsLoaded(true);
            }
        };
        loadState();
    }, []);

    // Store mock photos for Public album
    const mockPhotos = isLoaded && !hasSharedPublicImage ? [createIntroPhoto()] : [];

    // Mark a specific photo as seen
    const markPhotoAsSeen = (albumId: string, photoId: string) => {
        console.log('[MockAlbumContext] markPhotoAsSeen called:', { albumId, photoId });
        setUnseenPhotos(prev => {
            const newMap = new Map(prev);
            const albumSet = newMap.get(albumId);
            if (albumSet) {
                const newSet = new Set(albumSet);
                newSet.delete(photoId);
                if (newSet.size === 0) {
                    newMap.delete(albumId);
                } else {
                    newMap.set(albumId, newSet);
                }
            }
            return newMap;
        });
    };

    // Update shared state and persist
    const setHasSharedPublicImage = async (value: boolean) => {
        setHasSharedPublicImageState(value);
        try {
            await AsyncStorage.setItem('has_shared_public_image', value ? 'true' : 'false');
            if (value) {
                // Clear the intro photo from unseen if it was shared
                setUnseenPhotos(prev => {
                    const newMap = new Map(prev);
                    newMap.delete('public');
                    return newMap;
                });
            }
        } catch (e) {
            console.error('Failed to save mock album state', e);
        }
    };

    // Get count of unseen photos
    const getUnseenPhotoCount = (albumId?: string): number => {
        if (albumId) {
            return unseenPhotos.get(albumId)?.size || 0;
        }
        let total = 0;
        unseenPhotos.forEach(set => {
            total += set.size;
        });
        return total;
    };

    // Check if an album has unseen photos
    const hasUnseenPhotos = (albumId: string): boolean => {
        const albumSet = unseenPhotos.get(albumId);
        return albumSet !== undefined && albumSet.size > 0;
    };

    // Legacy support: convert to old format
    const unseenAlbums: { [albumId: string]: boolean } = {};
    unseenPhotos.forEach((set, albumId) => {
        unseenAlbums[albumId] = set.size > 0;
    });

    const markAlbumAsSeen = (albumId: string) => {
        setUnseenPhotos(prev => {
            const newMap = new Map(prev);
            newMap.delete(albumId);
            return newMap;
        });
    };

    return (
        <MockAlbumContext.Provider value={{
            unseenPhotos,
            mockPhotos,
            markPhotoAsSeen,
            getUnseenPhotoCount,
            hasUnseenPhotos,
            unseenAlbums,
            markAlbumAsSeen,
            setHasSharedPublicImage
        }}>
            {children}
        </MockAlbumContext.Provider>
    );
};

export const useMockAlbums = () => {
    const context = useContext(MockAlbumContext);
    if (context === undefined) {
        throw new Error('useMockAlbums must be used within a MockAlbumProvider');
    }
    return context;
};
