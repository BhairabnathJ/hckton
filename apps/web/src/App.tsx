import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { Card, EmptyState, LinkButton } from "./components/ui";
import { ActiveJob } from "./pages/ActiveJob";
import { Company } from "./pages/Company";
import { Home } from "./pages/Home";
import { JobBoard } from "./pages/JobBoard";
import { Landing } from "./pages/Landing";
import { LevelUp } from "./pages/LevelUp";
import { Login } from "./pages/Login";
import { Profile } from "./pages/Profile";
import { Workspace } from "./pages/Workspace";

function NotFound() {
  return (
    <div className="mx-auto max-w-xl p-6">
      <Card>
        <EmptyState
          title="Page not found"
          action={
            <LinkButton to="/home" variant="secondary" className="mt-2">
              Go home
            </LinkButton>
          }
        />
      </Card>
    </div>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route element={<AppShell />}>
        <Route path="/home" element={<Home />} />
        <Route path="/tickets" element={<Navigate to="/home" replace />} />
        <Route path="/tickets/:id" element={<Workspace />} />
        <Route path="/jobs" element={<JobBoard />} />
        <Route path="/jobs/:id" element={<ActiveJob />} />
        <Route path="/level-up" element={<LevelUp />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/users/:id" element={<Profile />} />
        <Route path="/company" element={<Company />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
