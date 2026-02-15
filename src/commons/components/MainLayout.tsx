import React from "react";
import { Outlet } from "react-router-dom";
import BottomNav from "./BottomNav";

const MainLayout: React.FC = () => {
  return (
    <div className="flex flex-col h-screen bg-bg-main">
      {/* Header */}

      {/* Main Content Area */}
      <main className="flex-1 relative w-full overflow-hidden">
        <Outlet />
      </main>

      {/* Bottom Navigation */}
      <BottomNav />
    </div>
  );
};

export default MainLayout;
