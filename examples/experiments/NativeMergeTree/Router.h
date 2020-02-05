#pragma once
#include <cassert>
#include <deque>
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

	uint32_t maxQueueLength = 0;
	std::deque<SequencedMessage> queue;

	ClientId GetLocalClientId() override
	{
		return ClientId::Create(7);
	}

	void Send(const Message &msg)
	{
		queue.emplace_back();
		SequencedMessage &smsg = queue.back();
		smsg.sequenceNumber = seq;
		smsg.clientSequenceNumber = msg.clientSequenceNumber;
		smsg.referenceSequenceNumber = msg.referenceSequenceNumber;
		smsg.minimumSequenceNumber = seq;
		smsg.clientId = GetLocalClientId();
		smsg.contents = msg.contents;

		seq = seq.next();

		while (queue.size() > maxQueueLength)
		{
			m_listener->OnMessageReceived(queue.front());
			queue.pop_front();
		}
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
	Seq seq = Seq::Create(1);
	std::vector<SequencedMessage> msgs;

	struct Endpoint : public IRouterEndpoint
	{
		ClientId client = ClientId::Nil();
		MultiClientRouter *router;

		ClientId GetLocalClientId() override
		{
			return client;
		}

		void AddListener(IMessageListener *listener) override
		{
			router->listeners.push_back(listener);
		}

		void Send(const Message &msg)
		{
			router->Receive(msg, client);
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

	void Receive(const Message &msg, ClientId client)
	{
		SequencedMessage smsg;
		smsg.sequenceNumber = this->seq;
		smsg.clientSequenceNumber = msg.clientSequenceNumber;
		smsg.referenceSequenceNumber = msg.referenceSequenceNumber;
		smsg.minimumSequenceNumber = Seq::Universal(); // TODO
		smsg.clientId = client;
		smsg.contents = msg.contents;

		this->seq = this->seq.next();
		msgs.push_back(std::move(smsg));
	}

	void PumpMessages()
	{
		for (auto &&msg : msgs)
			for (IMessageListener *listener : listeners)
				listener->OnMessageReceived(msg);
		msgs.clear();
	}
};
