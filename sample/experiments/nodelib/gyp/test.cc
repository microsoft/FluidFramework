#include <string>
#include <iostream>
#include "node.h"
#include "uv.h"
#include "libplatform/libplatform.h"
#include "v8.h"

using namespace v8;
using namespace node;

class MyPlatform : public v8::Platform {
public:
    MyPlatform() {
        tracing_controller_.reset(new TracingController());
    }
  
    void CallOnBackgroundThread(v8::Task* task, ExpectedRuntime expected_runtime) override {
    }

    void CallOnForegroundThread(v8::Isolate* isolate, v8::Task* task) override {
    }
    
    void CallDelayedOnForegroundThread(v8::Isolate* isolate, v8::Task* task, double delay_in_seconds) override {
    }
    
    double MonotonicallyIncreasingTime() override {
        return uv_hrtime() / 1e9;
    }

    v8::TracingController* GetTracingController() override {
        return tracing_controller_.get();
    }

    std::unique_ptr<v8::TracingController> tracing_controller_;
};

int Start(uv_loop_t* event_loop, Isolate* isolate, IsolateData* isolate_data, int argc, const char* const* argv, int exec_argc, const char* const* exec_argv) {
    HandleScope handle_scope(isolate);
    Local<Context> context = Context::New(isolate);
    Context::Scope context_scope(context);

    Environment* env = node::CreateEnvironment(isolate_data, context, argc, argv, exec_argc, exec_argv);
    LoadEnvironment(env);

    bool more;
    do
    {
        printf("uv_run\n");
        more = uv_run(event_loop, UV_RUN_ONCE);
        if (more == false)
        {
            node::EmitBeforeExit(env);

            // Emit `beforeExit` if the loop became alive either after emitting
            // event, or after running some callbacks.
            more = uv_loop_alive(event_loop);
            if (uv_run(event_loop, UV_RUN_NOWAIT) != 0)
                more = true;
        }
    } while (more == true);

    int exit_code = node::EmitExit(env);
    node::RunAtExit(env);

    return exit_code;
}

int Start(uv_loop_t* event_loop, int argc, const char* const* argv, int exec_argc, const char* const* exec_argv) {
    Isolate::CreateParams params;
    params.array_buffer_allocator = v8::ArrayBuffer::Allocator::NewDefaultAllocator();

    Isolate* const isolate = Isolate::New(params);
    isolate->SetAutorunMicrotasks(false);

    Locker locker(isolate);
    Isolate::Scope isolate_scope(isolate);
    HandleScope handle_scope(isolate);
    node::IsolateData* isolate_data = node::CreateIsolateData(isolate, event_loop);
    int exit_code = Start(event_loop, isolate, isolate_data, argc, argv, exec_argc, exec_argv);

    return exit_code;
}

int main(int argc, char **argv) {
    // node::Start(argc, argv);
    argv = uv_setup_args(argc, argv);

    int exec_argc;
    const char** exec_argv;
    node::Init(&argc, const_cast<const char**>(argv), &exec_argc, &exec_argv);

    v8::V8::InitializePlatform(new MyPlatform());
    v8::V8::Initialize();

    int exit_code = Start(uv_default_loop(), argc, argv, exec_argc, exec_argv);

    return exit_code;
}
