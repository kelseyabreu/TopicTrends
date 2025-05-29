import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Button } from "@/components/ui/button";
import "../styles/components/Header.css";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu";
import { cn } from "@/lib/utils";

function Header() {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  return (
    <div className="header">
      <div className="logo" onClick={() => navigate("/")}>
        Topic<span>Trends</span>
      </div>

      <div className={menuOpen ? "links active" : "links"}>
        <NavigationMenu className="z-5 ">
          <NavigationMenuList>
            <NavigationMenuItem>
              <NavigationMenuTrigger>Getting started</NavigationMenuTrigger>
              <NavigationMenuContent>
                <ul className="grid navMenuDropdownWidth gap-3 p-2 grid-cols-1 lg:grid-cols-[.75fr_1fr]">
                  <li className="row-span-6">
                    <NavigationMenuLink asChild>
                      <a
                        className="flex h-full w-full select-none flex-col justify-end rounded-base p-6 no-underline outline-hidden"
                        href="/"
                      >
                        <div className="mb-2 mt-4 text-lg font-heading">
                          Ideaocean
                        </div>
                        <p className="text-sm font-base leading-tight">
                          A place to share your ideas and connect with others.
                          Create a discussion, join a discussion, and contribute
                          to ideas.
                        </p>
                      </a>
                    </NavigationMenuLink>
                  </li>
                  {user ? (
                    <>
                     <ListItem href="/getting-started" title="Get Started">
                       Learn how to create discussions, gather ideas, and unlock collective insights get the most out of it.
                     </ListItem> 
                     <ListItem href="/create" title="Create Discussion">
                        Start your very own discussion and start engaging with others.
                      </ListItem>
                      <ListItem href="/discussions" title="Explore Discussions">
                        Find a discussion you want to contribute to.
                      </ListItem>
                      <ListItem href="/ideas" title="Explore Ideas">
                        View all ideas being posted you have access to.
                      </ListItem>
                      <ListItem href="/my-ideas" title="View My Ideas">
                        See all the ideas you have contributed to.
                       </ListItem>
                       <ListItem href="/my-interactions" title="View My Interactions">
                        View everything you've been up to.
                       </ListItem>
                    </>
                  ) : (
                    <>
                      <ListItem href="register" title="Register">
                        Sign Up to start seeing discussions.
                      </ListItem>
                    </>
                  )}
                </ul>
              </NavigationMenuContent>
            </NavigationMenuItem>
            <NavigationMenuItem>
              {user ? (
                <>
                  <NavigationMenuTrigger>{user.username}</NavigationMenuTrigger>
                  <NavigationMenuContent>
                    <ul className="grid navMenuDropdownWidth gap-3 p-2 grid-cols-1 lg:grid-cols-[.75fr_1fr]">
                      <li className="row-span-3 centerWelcomeUserHeader">
                        <NavigationMenuLink asChild>
                          <div className="flex h-full w-full select-none flex-col justify-end rounded-base p-6 no-underline outline-hidden">
                            <div className="mb-2 mt-4 text-lg font-heading">
                              Welcome {user.username}
                            </div>
                            <p className="text-sm font-base leading-tight">
                              Share your ideas with the world.
                            </p>
                          </div>
                        </NavigationMenuLink>
                      </li>
                      <ListItem href="/dashboard" title="Dashboard">
                          View your discussions and stats.
                      </ListItem>
                      <ListItem href="/settings" title="Settings">
                        Changes your settings.
                      </ListItem>
                      <ListItem onClick={handleLogout} title="Logout">
                        Logout of your account.
                      </ListItem>
                    </ul>
                  </NavigationMenuContent>
                </>
              ) : (
                <>
                  <NavigationMenuLink
                    href="/login"
                    className={navigationMenuTriggerStyle()}
                  >
                    Login
                  </NavigationMenuLink>
                </>
              )}
            </NavigationMenuItem>
          </NavigationMenuList>
        </NavigationMenu>
      </div>
    </div>
  );
}
function ListItem({
  className,
  title,
  children,
  ...props
}: React.ComponentProps<"a">) {
  return (
    <li>
      <NavigationMenuLink asChild>
        <a
          className={cn(
            "hover:bg-accent block text-main-foreground select-none space-y-1 rounded-base border-2 border-transparent p-3 leading-none no-underline outline-hidden transition-colors hover:border-border",
            className
          )}
          {...props}
        >
          <div className="text-base font-heading leading-none">{title}</div>
          <p className="font-base line-clamp-2 text-sm leading-snug">
            {children}
          </p>
        </a>
      </NavigationMenuLink>
    </li>
  );
}
ListItem.displayName = "ListItem";
export default Header;
