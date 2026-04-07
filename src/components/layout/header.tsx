"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment } from "react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { SidebarTrigger } from "@/components/ui/sidebar";

const routeLabels: Record<string, string> = {
  "/": "首页",
  "/chat": "Chat",
  "/knowledge": "Knowledge",
};

export function Header() {
  const pathname = usePathname();

  const pathSegments = pathname.split("/").filter(Boolean);

  const getBreadcrumbLabel = (segment: string, index: number) => {
    const fullPath = "/" + pathSegments.slice(0, index + 1).join("/");
    return routeLabels[fullPath] || segment;
  };

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
      <SidebarTrigger />
      <div className="w-px h-7 bg-gray-300"></div>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            {pathname === "/" ? (
              <BreadcrumbPage>首页</BreadcrumbPage>
            ) : (
              <BreadcrumbLink asChild>
                <Link href="/">首页</Link>
              </BreadcrumbLink>
            )}
          </BreadcrumbItem>
          {pathSegments.map((segment, index) => {
            const fullPath = "/" + pathSegments.slice(0, index + 1).join("/");
            const isLast = index === pathSegments.length - 1;

            return (
              <Fragment key={fullPath}>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  {isLast ? (
                    <BreadcrumbPage>
                      {getBreadcrumbLabel(segment, index)}
                    </BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink asChild>
                      <Link href={fullPath}>
                        {getBreadcrumbLabel(segment, index)}
                      </Link>
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
              </Fragment>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>
    </header>
  );
}
