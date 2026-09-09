/**
 * 《理性讨论须知》完成门槛（纯函数，供页面与服务端校验复用）。
 * M1 只要求"完成后方可发布"；后续若引入更重的引导/测验，把完成判据替换为记录即可。
 */

export interface CourseGateUser {
  courseCompletedAt: Date | string | null | undefined;
}

export function hasCompletedCourse(user: CourseGateUser | null | undefined): boolean {
  if (!user?.courseCompletedAt) return false;
  const completedAt = new Date(user.courseCompletedAt);
  return !Number.isNaN(completedAt.getTime());
}

/**
 * 发起话题前的发布资格校验：
 * 返回 null 表示可发布；否则返回指引文案（页面展示用，发布动作必须再次校验）。
 */
export function publishGateError(user: CourseGateUser | null | undefined): string | null {
  if (hasCompletedCourse(user)) return null;
  return "完成《理性讨论须知》后才能发布话题";
}
