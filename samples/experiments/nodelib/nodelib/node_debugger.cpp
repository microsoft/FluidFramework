// Copyright (c) 2014 GitHub, Inc.
// Use of this source code is governed by the MIT license that can be
// found in the LICENSE file.

#include "stdafx.h"
#include "node_debugger.h"
#include <shellapi.h>
#include <io.h>
#include <codecvt>
#include "nodelib.h"
#include "node.h"
#include "uv.h"
#include "libplatform/libplatform.h"
#include "v8.h"
#include "env.h"
//#include "env-inl.h"
#include "node.h"
//#include "node_buffer.h"
#include "node_debug_options.h"
//#include "node_internals.h"
//#include "node_platform.h"

using namespace v8;
using namespace node;
	NodeDebugger::NodeDebugger(node::Environment* env)
		: env_(env), platform_(nullptr) {
	}

	NodeDebugger::~NodeDebugger() {
		if (platform_)
			FreePlatform(platform_);
	}

	void NodeDebugger::Start() {
		auto inspector = env_->inspector_agent();
		if (inspector == nullptr)
			return;

		node::DebugOptions options;
		options.ParseOption("Electron", "--inspect-brk");
		//for (auto& arg : base::CommandLine::ForCurrentProcess()->argv()) {
		//	//#if defined(OS_WIN)
		//	options.ParseOption("Electron", base::UTF16ToUTF8(arg));
		//	//#else
		//	//			options.ParseOption("Electron", arg);
		//	//#endif
		//}

		//if (options.inspector_enabled()) {
		//	// Use custom platform since the gin platform does not work correctly
		//	// with node's inspector agent. We use the default thread pool size
		//	// specified by node.cc
			platform_ = node::CreatePlatform(
				/* thread_pool_size */ 4, /*env_->event_loop(),*/
				/* tracing_controller */ nullptr);

		//	// Set process._debugWaitConnect if --inspect-brk was specified to stop
		//	// the debugger on the first line
		//	/*if (options.wait_for_connect()) {
		//		mate::Dictionary process(env_->isolate(), env_->process_object());
		//		process.Set("_breakFirstLine", true);
		//	}*/

			inspector->Start(static_cast<node::NodePlatform*>(platform_), nullptr, options);
	//}
	}
