import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ArtistProvider } from "./context";
import Landing from "./pages/Landing";
import Studio from "./pages/Studio";
import Pricing from "./pages/Pricing";
import About from "./pages/About";
import Contact from "./pages/Contact";
import Artists from "./pages/Artists";
import ArtistDetail from "./pages/ArtistDetail";
import Projects from "./pages/Projects";
import ProjectDetail from "./pages/ProjectDetail";
import Trends from "./pages/Trends";
import Login from "./pages/Login";
import Settings from "./pages/Settings";
import Buzz from "./pages/Buzz";
import PlaylistTracker from "./pages/PlaylistTracker";
import ReleaseTiming from "./pages/ReleaseTiming";
import ContentCalendar from "./pages/ContentCalendar";
import Watchlist from "./pages/Watchlist";

function Home() {
  const visited = localStorage.getItem("visited");
  if (visited) return <Navigate to="/studio" replace />;
  localStorage.setItem("visited", "1");
  return <Landing />;
}

export default function App() {
  return (
    <BrowserRouter>
      <ArtistProvider>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/landing" element={<Landing />} />
          <Route path="/studio" element={<Studio />} />
          <Route path="/artists" element={<Artists />} />
          <Route path="/artists/:id" element={<ArtistDetail />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/projects/:id" element={<ProjectDetail />} />
          <Route path="/trends" element={<Trends />} />
          <Route path="/buzz" element={<Buzz />} />
          <Route path="/playlists" element={<PlaylistTracker />} />
          <Route path="/release-timing" element={<ReleaseTiming />} />
          <Route path="/content-calendar" element={<ContentCalendar />} />
          <Route path="/watchlist" element={<Watchlist />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/about" element={<About />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/login" element={<Login />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </ArtistProvider>
    </BrowserRouter>
  );
}
