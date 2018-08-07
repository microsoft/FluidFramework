#pragma once
#include <cassert>
#include "Messages.h"

struct IMessageListener
{
	virtual void OnMessageReceived(const SequencedMessage &) = 0;
};

struct IRouterEndpoint
{
	virtual ClientId GetLocalClientId() = 0;
	virtual void Send(const Message &msg) = 0;
	virtual void AddListener(IMessageListener *) = 0;
};

struct SimpleLoopbackRouter : public IRouterEndpoint
{
	IMessageListener *m_listener = nullptr;
	Seq seq = Seq::Create(0);

	ClientId GetLocalClientId() override
	{
		return ClientId::Create(7);
	}

	void Send(const Message &msg)
	{
		SequencedMessage smsg;
		smsg.sequenceNumber = seq;
		smsg.clientSequenceNumber = msg.clientSequenceNumber;
		smsg.referenceSequenceNumber = msg.referenceSequenceNumber;
		smsg.minimumSequenceNumber = seq;
		smsg.clientId = GetLocalClientId();
		smsg.contents = msg.contents;

		seq = seq.next();

		m_listener->OnMessageReceived(smsg);
	}

	void AddListener(IMessageListener * listener)
	{
		assert(m_listener == nullptr);
		m_listener = listener;
	}
};

template <size_t N>
struct MultiClientRouter
{
	Seq seq = Seq::Create(0);
	std::vector<SequencedMessage> msgs;

	struct Endpoint : public IRouterEndpoint
	{
		ClientId client = ClientId::Nil();
		MultiClientRouter *router;

		ClientId GetLocalClientId() override
		{
			return ClientId::Create(7);
		}

		void AddListener(IMessageListener *listener) override
		{
			router->listeners.push_back(listener);
		}

		void Send(const Message &msg)
		{
			SequencedMessage smsg;
			smsg.sequenceNumber = router->seq;
			smsg.clientSequenceNumber = msg.clientSequenceNumber;
			smsg.referenceSequenceNumber = msg.referenceSequenceNumber;
			smsg.minimumSequenceNumber = Seq::Universal(); // TODO
			smsg.clientId = GetLocalClientId();
			smsg.contents = msg.contents;

			router->seq = router->seq.next();
			router->msgs.push_back(std::move(smsg));
		}
	};

	std::array<Endpoint, N> endpoints;
	std::vector<IMessageListener *> listeners;

	MultiClientRouter()
	{
		for (uint32_t i = 0; i < N; i++)
		{
			endpoints[i].client = ClientId::Create(i + 10);
			endpoints[i].router = this;
		}
	}

	void PumpMessages()
	{
		for (auto &&msg : msgs)
			for (IMessageListener *listener : listeners)
				listener->OnMessageReceived(msg);
	}
};
