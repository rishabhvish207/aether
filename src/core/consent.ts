import { invoke } from "@tauri-apps/api/core";
import { isNative } from "./native";
/** Privileged setup commands show their own native confirmation; provider HTTP actions need one here. */
export async function confirmAction(
  message: string,
  nativeCommandConfirms = false,
) {
  if (isNative())
    return nativeCommandConfirms
      ? true
      : invoke<boolean>("confirm_setup_action", { message });
  return window.confirm(message);
}
