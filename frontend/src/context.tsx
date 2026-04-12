import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

interface ArtistInfo {
  id: number;
  name: string;
  stage_name: string | null;
  photo_url: string | null;
  genre: string;
  market: string;
  label: string;
  tags: string[];
}

interface ArtistContextType {
  artists: ArtistInfo[];
  current: ArtistInfo | null;
  setCurrent: (a: ArtistInfo) => void;
  reload: () => void;
}

const ArtistContext = createContext<ArtistContextType>({
  artists: [],
  current: null,
  setCurrent: () => {},
  reload: () => {},
});

export function ArtistProvider({ children }: { children: ReactNode }) {
  const [artists, setArtists] = useState<ArtistInfo[]>([]);
  const [current, setCurrentState] = useState<ArtistInfo | null>(null);

  const load = () => {
    fetch("/api/artists?roster=signed&limit=50")
      .then(r => r.json())
      .then(d => {
        const items = d.items || [];
        setArtists(items);

        // 저장된 선택 복원
        const savedId = localStorage.getItem("current_artist_id");
        if (savedId) {
          const found = items.find((a: ArtistInfo) => a.id === Number(savedId));
          if (found) { setCurrentState(found); return; }
        }
        // 없으면 첫 번째 선택
        if (items.length > 0 && !current) {
          setCurrentState(items[0]);
          localStorage.setItem("current_artist_id", String(items[0].id));
        }
      })
      .catch(() => {});
  };

  useEffect(() => { load(); }, []);

  const setCurrent = (a: ArtistInfo) => {
    setCurrentState(a);
    localStorage.setItem("current_artist_id", String(a.id));
  };

  return (
    <ArtistContext.Provider value={{ artists, current, setCurrent, reload: load }}>
      {children}
    </ArtistContext.Provider>
  );
}

export function useArtist() {
  return useContext(ArtistContext);
}
